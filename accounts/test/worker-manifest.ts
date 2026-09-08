export const cadavreManifest={"id": "cadavre", "worker": "cail-cadavre", "version": 1, "name": "Cadavre", "description": "Write a poem, one contribution at a time.", "kind": "poem", "href": "/cadavre/", "resumePath": "/cadavre/play/"};
export const fixtureManifest=(id:string,kind:string)=>({...cadavreManifest,id,worker:"cail-"+id,name:id,kind,href:"/"+id+"/",resumePath:"/"+id+"/play/"});
