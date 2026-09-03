"""Unit tests for the CAIL Gateway relay's pure functions (no network)."""
import importlib.util
import os
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SPEC = importlib.util.spec_from_file_location(
    "cail_proxy", os.path.join(HERE, "..", "ui", "cail_proxy.py"))
proxy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(proxy)

GATEWAY_MODELS = [
    {"id": "@cf/google/gemma-4-26b-a4b-it", "provider": "workers-ai", "status": "active",
     "modality": "text", "capabilities": ["text-generation", "reasoning", "vision"]},
    {"id": "@cf/meta/llama-3.1-8b-instruct-fp8", "provider": "workers-ai", "status": "active",
     "modality": "text", "capabilities": ["text-generation"]},
    {"id": "deepseek/deepseek-chat-v3.1", "provider": "openrouter", "status": "active",
     "modality": "text", "capabilities": ["text-generation", "reasoning"]},
    {"id": "@cf/openai/whisper", "provider": "workers-ai", "status": "active",
     "modality": "audio", "capabilities": ["speech-to-text"]},
    {"id": "@cf/baai/bge-m3", "provider": "workers-ai", "status": "active",
     "modality": "text", "capabilities": ["embeddings"]},
    {"id": "retired/model", "provider": "openrouter", "status": "deprecated",
     "modality": "text", "capabilities": ["text-generation"]},
    {"id": "@cf/google/gemma-4-26b-a4b-it", "provider": "workers-ai", "status": "active",
     "modality": "text", "capabilities": ["text-generation"]},
]


class SelectModels(unittest.TestCase):
    def test_keeps_only_active_text_generation_models(self):
        ids = [m["id"] for m in proxy.select_models(GATEWAY_MODELS)]
        self.assertNotIn("@cf/openai/whisper", ids)
        self.assertNotIn("@cf/baai/bge-m3", ids)
        self.assertNotIn("retired/model", ids)
        self.assertIn("@cf/meta/llama-3.1-8b-instruct-fp8", ids)
        self.assertIn("deepseek/deepseek-chat-v3.1", ids)


class ToCatalog(unittest.TestCase):
    def test_maps_to_page_shape_and_dedups(self):
        catalog = proxy.to_catalog(GATEWAY_MODELS, "@cf/google/gemma-4-26b-a4b-it")
        self.assertEqual(catalog["default"], "@cf/google/gemma-4-26b-a4b-it")
        ids = [r["id"] for r in catalog["models"]]
        self.assertEqual(len(ids), len(set(ids)))
        gemma = next(r for r in catalog["models"] if r["id"] == "@cf/google/gemma-4-26b-a4b-it")
        self.assertEqual(gemma["label"], "google/gemma-4-26b-a4b-it")
        self.assertEqual(gemma["provider"], "workers-ai")
        self.assertTrue(gemma["available"])
        self.assertTrue(gemma["reasoning"])
        self.assertEqual(set(gemma) >= {"id", "label", "provider", "model", "available"}, True)

    def test_default_falls_back_to_first_offered_model(self):
        catalog = proxy.to_catalog(GATEWAY_MODELS, "ollama:kimi-k2.5")
        self.assertEqual(catalog["default"], "@cf/google/gemma-4-26b-a4b-it")


class PrepareChatBody(unittest.TestCase):
    def setUp(self):
        self.catalog = proxy.to_catalog(GATEWAY_MODELS)

    def test_rejects_models_outside_the_gateway_catalog(self):
        for model in ("ollama:kimi-k2.5", "exquisite-corpse", "legion:exquisite-corpse", ""):
            with self.assertRaises(ValueError):
                proxy.prepare_chat_body({"model": model, "messages": []}, {"default": "", "models": self.catalog["models"]})

    def test_forces_non_streaming(self):
        out = proxy.prepare_chat_body(
            {"model": "@cf/meta/llama-3.1-8b-instruct-fp8", "messages": [], "stream": True}, self.catalog)
        self.assertIs(out["stream"], False)

    def test_switches_thinking_off_per_provider_for_reasoning_models(self):
        gemma = proxy.prepare_chat_body({"model": "@cf/google/gemma-4-26b-a4b-it", "messages": []}, self.catalog)
        self.assertEqual(gemma["chat_template_kwargs"], {"enable_thinking": False})
        self.assertNotIn("reasoning", gemma)
        deepseek = proxy.prepare_chat_body({"model": "deepseek/deepseek-chat-v3.1", "messages": []}, self.catalog)
        self.assertEqual(deepseek["reasoning"], {"enabled": False})
        self.assertNotIn("chat_template_kwargs", deepseek)
        llama = proxy.prepare_chat_body({"model": "@cf/meta/llama-3.1-8b-instruct-fp8", "messages": []}, self.catalog)
        self.assertNotIn("chat_template_kwargs", llama)
        self.assertNotIn("reasoning", llama)

    def test_keeps_a_callers_own_reasoning_setting(self):
        out = proxy.prepare_chat_body(
            {"model": "deepseek/deepseek-chat-v3.1", "messages": [], "reasoning": {"effort": "low"}}, self.catalog)
        self.assertEqual(out["reasoning"], {"effort": "low"})


if __name__ == "__main__":
    unittest.main()
