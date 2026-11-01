import {env} from 'cloudflare:workers';
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 const form=await req.formData(),file=form.get('file'),trip=form.get('trip');
 if(!(file instanceof File)||typeof trip!=='string'||file.size>10*1024*1024)throw Error('Choose a file under 10 MB');
 if(!await env.DB!.prepare('SELECT id FROM records WHERE id=? AND kind=?').bind(trip,'trips').first())throw Error('Trip missing');
 const bucket=(env as any).BUCKET;if(!bucket)throw Error('File storage unavailable');
 const id=crypto.randomUUID(),key='documents/'+id;await bucket.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:'application/octet-stream'}});
 try{await env.DB!.prepare('INSERT INTO records(id,kind,data,updated) VALUES(?,?,?,?)').bind(id,'documents',JSON.stringify({name:file.name,trip,status:'Received',visibility:'Internal',key,size:file.size,url:'/api/documents?id='+id}),new Date().toISOString()).run()}catch(e){await bucket.delete(key);throw e}
 return Response.json({ok:true});
 }catch(e:any){return Response.json({error:e.message},{status:400})}}
export async function GET(req:Request){const id=new URL(req.url).searchParams.get('id');const row=await env.DB!.prepare('SELECT data FROM records WHERE id=? AND kind=?').bind(id,'documents').first<{data:string}>();if(!row)return new Response('Not found',{status:404});const d=JSON.parse(row.data),obj=await (env as any).BUCKET?.get(d.key);if(!obj)return new Response('Not found',{status:404});return new Response(obj.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(d.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})}
