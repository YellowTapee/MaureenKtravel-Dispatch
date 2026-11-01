import {env} from 'cloudflare:workers';
export async function POST(req:Request){
 try{
  if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Invalid origin'},{status:403});
  const {id}=await req.json() as {id:string};
  const row=await env.DB!.prepare('SELECT data FROM records WHERE id=? AND kind=?').bind(id,'quotes').first<{data:string}>();
  if(!row)throw Error('Quote not found');
  const q=JSON.parse(row.data),now=new Date().toISOString();
  if(q.expires&&q.expires<now.slice(0,10))throw Error('Quote expired');
  const booking={...q,status:'Confirmed',quote:id};delete booking.expires;
  const statements=[env.DB!.prepare('INSERT INTO records(id,kind,data,updated) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING').bind('quote-booking-'+id,'bookings',JSON.stringify(booking),now),env.DB!.prepare('UPDATE records SET data=?,updated=? WHERE id=? AND kind=?').bind(JSON.stringify({...q,status:'Accepted'}),now,id,'quotes')];
  for(const name of ['Collect deposit','Confirm supplier booking','Send confirmation'])statements.push(env.DB!.prepare('INSERT INTO records(id,kind,data,updated) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING').bind('quote-task-'+id+'-'+name,'tasks',JSON.stringify({name,trip:q.trip,status:'Open'}),now));
  await env.DB!.batch(statements);return Response.json({ok:true});
 }catch(e:any){return Response.json({error:e.message},{status:400})}
}
