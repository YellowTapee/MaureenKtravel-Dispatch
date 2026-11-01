import {env} from 'cloudflare:workers';
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 const {id,action,percent}=await req.json() as any;const row=await env.DB!.prepare('SELECT data FROM records WHERE id=? AND kind=?').bind(id,'trips').first<{data:string}>();if(!row)throw Error('Trip missing');const t=JSON.parse(row.data),now=new Date().toISOString(),records:any[]=[];
 const day=(date:string,offset:number)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return '';const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)};
 if(action==='schedule'){
 if(!Number.isFinite(percent)||percent<0||percent>100)throw Error('Deposit percent must be between 0 and 100');
 const b=await env.DB!.prepare('SELECT data FROM records WHERE kind=?').bind('bookings').all();const total=b.results.map((r:any)=>JSON.parse(r.data)).filter(r=>r.trip===id&&r.status!=='Cancelled').reduce((s,r)=>s+(r.sale||0),0);if(!total)throw Error('Add priced bookings first');const deposit=Math.round(total*percent/100);
 records.push({id:'schedule-deposit-'+id,kind:'schedules',name:'Deposit',trip:id,amount:deposit,due:now.slice(0,10),status:'Pending'},{id:'schedule-final-'+id,kind:'schedules',name:'Final payment',trip:id,amount:total-deposit,due:t.paymentDue||day(t.start,-30),status:'Pending'});
 }else if(action==='reminders'){
 for(const [name,due] of [['Quote follow-up',day(now.slice(0,10),2)],['Final payment reminder',t.paymentDue||day(t.start,-30)],['Check documents',day(t.start,-14)],['Pre-departure check-in',day(t.start,-2)],['Post-trip thank you and review',day(t.end,2)],['Repeat-trip follow-up',day(t.end,330)]])records.push({id:'reminder-'+id+'-'+name,kind:'tasks',name,trip:id,due,status:'Open'});
 for(const name of ['Passport details','Supplier confirmation','Insurance decision','Travel vouchers'])records.push({id:'document-check-'+id+'-'+name,kind:'documents',name,trip:id,status:'Missing',visibility:'Internal'});
 }else if(action==='duplicate'){
 const copy=crypto.randomUUID();records.push({...t,id:copy,kind:'trips',name:t.name+' copy',start:'',end:'',paymentDue:'',status:'Draft'});
 }else throw Error('Unknown action');
 await env.DB!.batch(records.map(({id,kind,...data})=>env.DB!.prepare('INSERT INTO records(id,kind,data,updated) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id,kind,JSON.stringify(data),now)));return Response.json({ok:true});
 }catch(e:any){return Response.json({error:e.message},{status:400})}}
