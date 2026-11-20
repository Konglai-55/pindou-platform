export function paintPreview(canvas, pattern, {beads=false, sparkle=false, grid=false}={}) {
  const context = canvas.getContext('2d');
  beads=beads&&Math.max(pattern.w,pattern.h)<=72;
  const size = beads ? 12 : Math.min(12, Math.max(3,Math.floor(320 / Math.max(pattern.w,pattern.h))));
  canvas.width = pattern.w * size;
  canvas.height = pattern.h * size;
  const colors = new Map(pattern.palette.map(c=>[c.code,c.hex]));
  if (grid) {
    context.fillStyle = '#dfdcfc';
    for (let y=0; y<pattern.h; y++) for (let x=0; x<pattern.w; x++) {
      context.beginPath(); context.arc(x*size+6,y*size+6,1.25,0,Math.PI*2); context.fill();
    }
  }
  pattern.cells.forEach((code,index)=>{
    if(!code) return;
    const x=(index % pattern.w)*size, y=Math.floor(index/pattern.w)*size;
    context.fillStyle=colors.get(code)||'#000';
    if (!beads) {
      context.fillRect(x,y,size,size);
      return;
    }
    context.shadowColor='#42365265'; context.shadowBlur=1.8; context.shadowOffsetY=1.4;
    context.beginPath(); context.arc(x+6,y+6,5.6,0,Math.PI*2); context.fill();
    context.shadowColor='transparent'; context.shadowOffsetY=0;
    context.fillStyle='#160d253d'; context.beginPath(); context.arc(x+6,y+6,1.82,0,Math.PI*2); context.fill();
    context.fillStyle='#ffffff68'; context.beginPath(); context.ellipse(x+5,y+2.9,2.45,.6,-.28,0,Math.PI*2); context.fill();
  });
  if(sparkle) {
    const gems = [[4,4,'#ff7ea1'],[26,5,'#ffc14f'],[4,20,'#a797ff'],[27,22,'#9f8bff']];
    context.lineWidth=2.5; context.lineCap='round';
    for(const [x,y,color] of gems){
      context.strokeStyle=color; context.beginPath();
      context.moveTo(x*size-7,y*size); context.lineTo(x*size+7,y*size);
      context.moveTo(x*size,y*size-7); context.lineTo(x*size,y*size+7);
      context.stroke();
    }
  }
}