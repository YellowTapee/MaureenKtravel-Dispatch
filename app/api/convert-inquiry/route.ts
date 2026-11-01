import {env} from 'cloudflare:workers';
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 const {id}=await req.json() as any;const row=await env.DB!.prepare('SELECT data FROM records WHERE id=? AND kind=?').bind(id,'inquiries').first<{data:string}>();if(!row)throw Error('Inquiry missing');
 const q=JSON.parse(row.data),now=new Date().toISOString(),client='inquiry-client-'+id,trip='inquiry-trip-'+id;
 const records=[{id:client,kind:'clients',name:q.name,email:q.email||'',phone:q.phone||'',notes:q.notes||''},{...q,id:trip,kind:'trips',client,name:q.destination?`${q.name} · ${q.destination}`:q.name,status:'Draft'},{id:'inquiry-followup-'+id,kind:'tasks',trip,name:'Prepare quote and follow up',status:'Open'}];
 await env.DB!.batch([...records.map(({id,kind,...data})=>env.DB!.prepare('INSERT INTO records(id,kind,data,updated) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id,kind,JSON.stringify(data),now)),env.DB!.prepare('UPDATE records SET data=?,updated=? WHERE id=?').bind(JSON.stringify({...q,status:'Booked',convertedTrip:trip}),now,id)]);return Response.json({ok:true,trip});
 }catch(e:any){return Response.json({error:e.message},{status:400})}}
