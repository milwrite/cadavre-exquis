"""QLoRA fine-tune a small Gemma on the next-line dataset with Unsloth.

Default target is `unsloth/gemma-3-4b-it` (ungated mirror, Unsloth-proven) so it
trains on a 24 GB laptop RTX 5090. The hosted game currently uses
`deepseek-v4-flash`; this recipe can transfer upward — set
MODEL=google/gemma-4-12B-it to move up once proven.

Loss is masked to the assistant (next-line) tokens via train_on_responses_only,
so the model learns *continuation*, not the instruction boilerplate.

    .venv/bin/pip install -r requirements-train.txt   # torch + unsloth + trl
    MODEL=unsloth/gemma-3-4b-it .venv/bin/python train/train_qlora.py --epochs 2

Env: MODEL, MAX_SEQ_LEN, GGUF=1 (export q4_k_m for Ollama), PUSH_REPO=milwright/...
"""
from __future__ import annotations

import argparse
import os
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
TRAIN = ROOT / "data" / "processed" / "next_line.train.jsonl"
VAL = ROOT / "data" / "processed" / "next_line.val.jsonl"
OUT = ROOT / "outputs"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=float, default=2.0)
    ap.add_argument("--max-steps", type=int, default=0,
                    help="if >0, cap training at this many steps (smoke test)")
    ap.add_argument("--lr", type=float, default=2e-4)
    ap.add_argument("--r", type=int, default=16)
    ap.add_argument("--bs", type=int, default=2)
    ap.add_argument("--grad-accum", type=int, default=4)
    args = ap.parse_args()

    model_name = os.environ.get("MODEL", "unsloth/gemma-3-4b-it")
    max_seq = int(os.environ.get("MAX_SEQ_LEN", "1024"))
    if not TRAIN.exists():
        raise SystemExit("dataset missing — run: python -m src.build_dataset")

    # Imports are inside main so the file is readable without a GPU env installed.
    from unsloth import FastModel  # type: ignore
    from unsloth.chat_templates import get_chat_template, train_on_responses_only  # type: ignore
    from datasets import load_dataset  # type: ignore
    from trl import SFTTrainer, SFTConfig  # type: ignore

    model, tokenizer = FastModel.from_pretrained(
        model_name=model_name,
        max_seq_length=max_seq,
        load_in_4bit=True,
        full_finetuning=False,
    )
    model = FastModel.get_peft_model(
        model,
        r=args.r,
        lora_alpha=args.r,
        lora_dropout=0.0,
        bias="none",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                        "gate_proj", "up_proj", "down_proj"],
        use_gradient_checkpointing="unsloth",
        random_state=3407,
    )
    # Prefer the model's OWN chat template (this is what vLLM applies at
    # inference); only fall back to the Unsloth gemma-3 template if the base
    # tokenizer ships without one. Keeps train-time formatting == serve-time.
    if not getattr(tokenizer, "chat_template", None):
        tokenizer = get_chat_template(tokenizer, chat_template="gemma-3")

    def fmt(ex):
        return {"text": tokenizer.apply_chat_template(
            ex["messages"], tokenize=False, add_generation_prompt=False)}

    ds = load_dataset("json", data_files={"train": str(TRAIN), "val": str(VAL)})
    ds = ds.map(fmt, remove_columns=[c for c in ds["train"].column_names if c != "text"])

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=ds["train"],
        eval_dataset=ds["val"],
        args=SFTConfig(
            dataset_text_field="text",
            max_seq_length=max_seq,
            per_device_train_batch_size=args.bs,
            gradient_accumulation_steps=args.grad_accum,
            warmup_steps=10,
            num_train_epochs=args.epochs,
            max_steps=args.max_steps if args.max_steps > 0 else -1,
            learning_rate=args.lr,
            logging_steps=20,
            eval_strategy="steps",
            eval_steps=200,
            optim="adamw_8bit",
            weight_decay=0.01,
            lr_scheduler_type="cosine",
            seed=3407,
            output_dir=str(OUT),
            report_to="none",
        ),
    )
    # Auto-detect the turn markers from THIS base's own template (gemma-3 uses
    # <start_of_turn>…, gemma-4 E4B uses <|turn>…), so the response-only mask
    # works regardless of base. We render a probe and read the exact strings that
    # bracket the user and assistant content.
    def detect_parts(tk):
        U, A = "▐USR▐", "▐AST▐"
        full = tk.apply_chat_template(
            [{"role": "user", "content": U}, {"role": "assistant", "content": A}],
            tokenize=False, add_generation_prompt=False)
        iu, ia = full.index(U), full.index(A)
        return full[:iu], full[iu + len(U):ia]

    instruction_part, response_part = detect_parts(tokenizer)
    print(f"train_on_responses_only markers: instr={instruction_part!r} resp={response_part!r}")
    trainer = train_on_responses_only(
        trainer, instruction_part=instruction_part, response_part=response_part)
    trainer.train()

    lora_dir = OUT / "lora"
    model.save_pretrained(str(lora_dir))
    tokenizer.save_pretrained(str(lora_dir))
    print(f"saved LoRA adapter -> {lora_dir}")

    if os.environ.get("GGUF") == "1":
        model.save_pretrained_gguf(str(OUT / "gguf"), tokenizer, quantization_method="q4_k_m")
        print(f"saved GGUF -> {OUT/'gguf'} (q4_k_m; drop into Ollama/Open WebUI)")

    repo = os.environ.get("PUSH_REPO")
    if repo:
        model.push_to_hub_merged(repo, tokenizer, save_method="lora", private=True)
        print(f"pushed adapter -> https://hf.co/{repo}")


if __name__ == "__main__":
    main()
