const fs=require('node:fs'),path=require('node:path');
const D=require('./domain.js');
class Store{
 constructor(file){this.file=file;if(fs.existsSync(file)){const bytes=fs.readFileSync(file,'utf8'),raw=JSON.parse(bytes);this.state=D.validateState(raw);this.legacyBytes=raw.version===1?bytes:null;}else this.state=D.defaults();}
 commit(next){
  next=D.validateState(next);fs.mkdirSync(path.dirname(this.file),{recursive:true});
  if(this.legacyBytes){const legacy=this.file+'.pre-v0.5.bak';if(!fs.existsSync(legacy))fs.writeFileSync(legacy,this.legacyBytes,{mode:0o600,flag:'wx'});this.legacyBytes=null;}
  const temp=this.file+'.tmp',fd=fs.openSync(temp,'w',0o600);
  try{fs.writeFileSync(fd,JSON.stringify(next,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  if(fs.existsSync(this.file))fs.copyFileSync(this.file,this.file+'.bak');fs.renameSync(temp,this.file);this.state=next;return this.state;
 }
 change(action,input,now){const next=D.change(this.state,action,input,now);return next===this.state?this.state:this.commit(next);}
 save(input){return this.change('save',input);}remove(id){return this.change('delete',id);}settings(input){return this.change('settings',input);}mark(ids){return this.change('mark',ids);}merge(raw){return this.change('import',raw);}
}
module.exports={...D,Store};
