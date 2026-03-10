const http = require('http');
function req(m,p,b,t){return new Promise((r,j)=>{const u=new URL(p,'http://127.0.0.1:3000');const o={hostname:u.hostname,port:u.port,path:u.pathname,method:m,headers:{'Content-Type':'application/json',...(t?{Authorization:'Bearer '+t}:{})}};const q=http.request(o,res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>r(JSON.parse(d)))});q.on('error',j);if(b)q.write(JSON.stringify(b));q.end()})}
async function main(){
  const l=await req('POST','/auth/login',{email:'admin@lab.com',password:'Admin@2026'});
  const t=l.accessToken;
  const cat=await req('GET','/test-catalog',null,t);
  const codes=['WBC','NEUTA','LYMPHA','MONOA','EOSA','BASOA','NEUT','LYMPH','MONO','EOS','BASO','RBC','HB','HCT','MCV','MCH','MCHC','RDWCV','RDWSD','PLT','MPV','PDW','PLTCT','PLCC','PLCR'];
  for(const c of codes){
    const m=cat.find(x=>x.code===c);
    console.log(c.padEnd(8)+': '+(m ? 'FOUND ('+m.name+')' : 'MISSING'));
  }
}
main();
