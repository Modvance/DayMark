const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
for(const [source,target,style,script]of [['index.html','preview.html','style.css','renderer.js'],['panel.html','widget-preview.html','panel.css','panel.js']]){
 let html=fs.readFileSync(path.join(root,'src',source),'utf8');
 html=html.replace("script-src 'self'; style-src 'self';","script-src 'unsafe-inline'; style-src 'unsafe-inline';");
 html=html.replace(`<link rel="stylesheet" href="${style}">`,()=>'<style>'+fs.readFileSync(path.join(root,'src',style),'utf8')+'</style>');
 for(const file of (source==='index.html'?['domain.js','ui.js','goals.js',script]:['domain.js','ui.js',script]))html=html.replace(`<script src="${file}"></script>`,()=>'<script>'+fs.readFileSync(path.join(root,'src',file),'utf8').replace(/<\/script/gi,'<\\/script')+'</script>');
 fs.writeFileSync(path.join(root,target),html);
}
console.log('Created preview.html and widget-preview.html');
