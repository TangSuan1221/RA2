import {readFileSync,writeFileSync,renameSync} from 'node:fs';


const ranges={
  'vault.distance':[.8,10],'vault.hold':[0,5],
  'camera.idleDistance':[.6,4],'camera.walkDistance':[.8,5],'camera.fov':[35,80],
  'camera.shoulderOffset':[0,.7],'camera.horizontal':[-15,15],'camera.vertical':[-15,15],'camera.response':[2,18]
};

export function actionSettingsApi(file=new URL('./action-settings.json',import.meta.url)){
  return {name:'action-settings',configureServer(server){
    server.middlewares.use('/api/action-settings',async(req,res)=>{
      if(req.method==='GET'){
        res.setHeader('Cache-Control','no-store');
        res.setHeader('Content-Type','application/json');
        return res.end(readFileSync(file,'utf8'));
      }
      if(req.method!=='PATCH'){res.statusCode=405;return res.end();}
      if(!['http://'+req.headers.host,'https://'+req.headers.host].includes(req.headers.origin)){res.statusCode=403;return res.end();}
      try{
        let body='';
        for await(const chunk of req){body+=chunk;if(body.length>8192){res.statusCode=413;return res.end();}}
        const changes=JSON.parse(body);
        if(!changes||Array.isArray(changes)||typeof changes!=='object')throw Error();
        for(const [key,value] of Object.entries(changes)){
          const range=/^rate\.[@\w/.-]{1,160}$/.test(key)?[.1,4]:Object.hasOwn(ranges,key)?ranges[key]:null;
          if(!range||!Number.isFinite(value)||value<range[0]||value>range[1])throw Error();
        }
        const settings=JSON.parse(readFileSync(file,'utf8'));
        if(Object.entries(changes).some(([k,v])=>settings[k]!==v)){
          const temp=new URL('./.action-settings-'+process.pid+'.tmp',file);
          writeFileSync(temp,JSON.stringify({...settings,...changes},null,2)+'\n');renameSync(temp,file);
        }
        res.statusCode=204;
      }catch(error){res.statusCode=error.code?500:400;}
      res.end();
    });
  }};
}
