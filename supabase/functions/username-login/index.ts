import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
Deno.serve(async (req:Request)=>{
 const allowed=Deno.env.get('ALLOWED_ORIGIN')||'';
 const headers={'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
 const respond=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
 if(req.headers.get('origin')!==allowed||!allowed)return respond({error:'Origin không được phép.'},403);
 if(req.method==='OPTIONS')return new Response(null,{headers});if(req.method!=='POST')return respond({error:'Chỉ chấp nhận POST.'},405);
 try{
  if(Number(req.headers.get('content-length')||0)>4096)return respond({error:'Yêu cầu quá lớn.'},413);
  const body=await req.text();if(body.length>4096)return respond({error:'Yêu cầu quá lớn.'},413);
  const {username,password}=JSON.parse(body);
  if(typeof username!=='string'||typeof password!=='string'||username.length>80||password.length>256)return respond({error:'Thông tin không hợp lệ.'},400);
  const url=Deno.env.get('SUPABASE_URL')!;
  const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  // Rate by username as a non-spoofable baseline; IP hash is supplemental behind trusted gateway.
  const ip=req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip))),n=>n.toString(16).padStart(2,'0')).join('');
  const {data:email,error:lookupError}=await service.rpc('login_lookup',{p_username:username,p_rate_key:hash});
  if(lookupError)return respond({error:'Vui lòng thử lại sau.'},429);
  if(!email)return respond({error:'Tên đăng nhập hoặc mật khẩu chưa đúng.'},401);
  const auth=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false}});
  const {data,error}=await auth.auth.signInWithPassword({email,password});
  if(error||!data.session)return respond({error:'Tên đăng nhập hoặc mật khẩu chưa đúng.'},401);
  return respond({access_token:data.session.access_token,refresh_token:data.session.refresh_token});
 }catch{return respond({error:'Không thể đăng nhập. Vui lòng thử lại.'},400);}
});
