const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {getMarket}=require('./market-data.cjs');
const PROD=process.env.NODE_ENV==='production',PORT=Number(process.env.PORT||8772);
const configured=process.env.PUBLIC_ORIGIN||process.env.RENDER_EXTERNAL_URL;
if(PROD&&!configured)throw Error('Missing public origin');
const origin=new URL(configured||'http://127.0.0.1:'+PORT);
if(origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||(PROD&&origin.protocol!=='https:'))throw Error('Invalid public origin');
const TOKEN='0x21Fe032a64d1488fC71F9d0693e2D5E05Fa29412';let chainCache=null,chainTime=0,stockPending=null;
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))}
async function rpc(method,params=[]){const r=await fetch('https://bsc-dataseed.bnbchain.org',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('RPC unavailable');const j=await r.json();if(j.error||j.result===undefined)throw Error('RPC error');return j.result}
function units(hex,d){let s=BigInt(hex).toString().padStart(d+1,'0');const fraction=d?s.slice(-d).replace(/0+$/,''):'';return d?s.slice(0,-d)+(fraction?'.'+fraction:''):s}
async function chain(treasury){if(chainCache&&Date.now()-chainTime<15000&&chainCache.treasury===treasury)return chainCache;if(await rpc('eth_chainId')!=='0x38')throw Error('Wrong chain');const block=await rpc('eth_blockNumber');if(await rpc('eth_getCode',[TOKEN,block])==='0x')throw Error('No contract');const call=data=>rpc('eth_call',[{to:TOKEN,data},block]);const [dec,total,balance,bnb]=await Promise.all([call('0x313ce567'),call('0x18160ddd'),treasury?call('0x70a08231'+treasury.slice(2).toLowerCase().padStart(64,'0')):null,treasury?rpc('eth_getBalance',[treasury,block]):null]);const decimals=Number(BigInt(dec));if(decimals>36)throw Error('Unsupported decimals');chainCache={treasury,token:TOKEN,block:Number(BigInt(block)),decimals,total:units(total,decimals),balance:balance?units(balance,decimals):null,bnb:bnb?units(bnb,18):null,checked:new Date().toISOString()};chainTime=Date.now();return chainCache}

const assets={"/market.html":"market.html","/markets.js":"markets.js","/markets.css":"markets.css","/swap.html":"swap.html","/swap.js":"swap.js","/swap.css":"swap.css","/buy.html":"buy.html","/sale.js":"sale.js","/sale.css":"sale.css","/style.css":"style.css","/wallet.js":"wallet.js","/nex-coin.png":"nex-coin.png","/nexora-background.jpg":"nexora-background.jpg"};
const pages={'/':'market.html','/market':'market.html','/swap':'swap.html','/buy':'buy.html'};
const server=http.createServer(async(req,res)=>{
res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");if(PROD)res.setHeader('Strict-Transport-Security','max-age=31536000');
try{
if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Read-only public website'});
const url=new URL(req.url,origin);
if(url.pathname==='/healthz')return json(res,200,{ok:true,mode:'public-free'});
if(req.headers.host!==origin.host)return json(res,403,{error:'Host not allowed'});
if(url.pathname==='/api/market'){try{return json(res,200,await getMarket())}catch{return json(res,502,{error:'โหลดราคาตลาดไม่ได้ กรุณาลองใหม่'})}}
if(url.pathname==='/api/sale-info'){try{if(!stockPending)stockPending=chain('0xE29D4f4726c456900cD02F3F29c0216648c10DF6').finally(()=>stockPending=null);return json(res,200,await stockPending)}catch{return json(res,502,{error:'อ่านยอด BSC ไม่สำเร็จ'})}}
const name=pages[url.pathname]||assets[url.pathname];if(!name)return json(res,404,{error:'ไม่มีหน้านี้ในเว็บสาธารณะ'});
const ext=path.extname(name),types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.jpg':'image/jpeg','.png':'image/png'};
const file=path.join(__dirname,'public',name);res.setHeader('Content-Type',types[ext]);res.setHeader('Cache-Control',['.png','.jpg'].includes(ext)?'public, max-age=86400':'no-cache');res.setHeader('Content-Length',fs.statSync(file).size);if(req.method==='HEAD')return res.end();fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
}catch{if(!res.headersSent)json(res,500,{error:'Service unavailable'});else res.destroy()}
});
if(require.main===module){server.listen(PORT,PROD?'0.0.0.0':'127.0.0.1',()=>console.log('NEX public website ready on port '+PORT));process.on('SIGTERM',()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref()})}
module.exports={server};
