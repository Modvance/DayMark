const {spawn} = require('node:child_process');
const {createInterface} = require('node:readline');
const {randomUUID} = require('node:crypto');
const path = require('node:path');
class WindowsPanel {
  constructor() { this.child=null; this.pending=new Map(); this.ready=null; this.chain=Promise.resolve(); }
  start() {
    if(this.ready) return this.ready;
    this.ready = new Promise((resolve,reject) => {
      const script=path.join(__dirname,'native','desktop-panel.ps1').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
      const exe=path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
      const child=this.child=spawn(exe,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{windowsHide:true,stdio:['pipe','pipe','pipe']});
      const timeout=setTimeout(()=>{reject(Error('桌面组件初始化超时'));this.stop();},15000);
      let stderr='';
      child.stderr.on('data',data=>stderr=(stderr+data.toString()).slice(-2000));
      createInterface({input:child.stdout}).on('line',line=>{
        let reply;try {reply=JSON.parse(line);}catch{return;}
        if('ready' in reply) {clearTimeout(timeout);reply.ready?resolve():reject(Error(reply.error));return;}
        const pending=this.pending.get(reply.id);if(!pending)return;
        this.pending.delete(reply.id);clearTimeout(pending.timeout);
        reply.ok?pending.resolve(reply.mode):pending.reject(Error(reply.error || '桌面切换失败'));
      });
      const failed=error=>{clearTimeout(timeout);reject(error);for(const p of this.pending.values()){clearTimeout(p.timeout);p.reject(error);}this.pending.clear();if(this.child===child){this.child=null;this.ready=null;}};
      child.on('error',failed);
      child.on('exit',()=>failed(Error(stderr || 'Windows 桌面组件进程已退出')));
      child.stdin.on('error',failed);
    });
    return this.ready;
  }
  apply(command) {
    const operation=async()=>{
      await this.start();
      return new Promise((resolve,reject)=>{
        const id=randomUUID();
        const timeout=setTimeout(()=>{this.pending.delete(id);reject(Error('桌面窗口操作超时'));},5000);
        this.pending.set(id,{resolve,reject,timeout});
        this.child.stdin.write(JSON.stringify({...command,id})+'\n');
      });
    };
    const result=this.chain.then(operation);this.chain=result.catch(()=>{});return result;
  }
  stop() {
    const child=this.child;this.child=null;this.ready=null;
    for(const p of this.pending.values()){clearTimeout(p.timeout);p.reject(Error('桌面组件已停止'));}this.pending.clear();
    child?.kill();
  }
}
module.exports={WindowsPanel};
