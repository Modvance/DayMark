const sizes = { small: [320, 460], normal: [360, 600], large: [400, 740] };
function panelBounds(saved, displays, size = 'normal', collapsed = false) {
  const valid = saved && Number.isFinite(saved.x) && Number.isFinite(saved.y);
  const area = (valid && displays.find(a => saved.x + 60 > a.x && saved.x < a.x + a.width - 60 && saved.y + 40 > a.y && saved.y < a.y + a.height - 40)) || displays[0];
  const [w, h] = size && typeof size === 'object' ? [size.width, size.height] : sizes[size] || sizes.normal;
  const width = Math.min(w, area.width), height = Math.min(collapsed ? 112 : h, area.height);
  const x = valid ? saved.x : area.x + area.width - width - 24;
  const y = valid ? saved.y : area.y + 32;
  return { x: Math.round(Math.max(area.x, Math.min(x, area.x + area.width - width))), y: Math.round(Math.max(area.y, Math.min(y, area.y + area.height - height))), width, height };
}
function dimensions(raw, fallback={width:360,height:600}) {
  return {width:Number.isFinite(raw?.width)?Math.round(Math.max(280,Math.min(1000,raw.width))):fallback.width,height:Number.isFinite(raw?.height)?Math.round(Math.max(360,Math.min(1400,raw.height))):fallback.height};
}
function dragBounds(original,dx,dy,edge) {
  if(edge==='move')return {...original,x:original.x+dx,y:original.y+dy};
  const right=original.x+original.width,bottom=original.y+original.height;
  const width=edge.includes('e')?original.width+dx:edge.includes('w')?original.width-dx:original.width;
  const height=edge.includes('s')?original.height+dy:edge.includes('n')?original.height-dy:original.height;
  const size=dimensions({width,height});
  return {x:edge.includes('w')?right-size.width:original.x,y:edge.includes('n')?bottom-size.height:original.y,...size};
}
module.exports = { panelBounds, dimensions, dragBounds };
