-- Deploy the new Worker before this app-owned registration ownership change.
-- Account IDs and saved entries remain unchanged.
UPDATE registered_workers SET worker='cadavre',version=2,manifest='{"id":"cadavre","worker":"cadavre","version":2,"name":"Cadavre","description":"Write a poem, one contribution at a time.","kind":"poem","href":"/","resumePath":"/play/","workerRoutes":true}' WHERE id='cadavre' AND worker='cail-cadavre' AND kind='poem' AND version=1;
SELECT id,worker,version,manifest FROM registered_workers WHERE id='cadavre';
