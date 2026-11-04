import {startPreview} from './quick-look.mjs';
import {normalize,compile} from './curve.mjs';

await startPreview({render:async({ink,file,root})=>{
 const paint=records=>{
  root.replaceChildren();
  for(const record of records){const values=JSON.parse(record.body).values||{},heading=document.createElement('h2');heading.textContent=values.name||record.title;root.append(heading);
   let curve;try{curve=normalize(values);}catch{const details=document.createElement('pre');details.textContent=JSON.stringify(values,null,2);root.append(details);continue;}
   const evaluate=compile(curve),minX=curve.points[0].x,maxX=curve.points.at(-1).x,samples=Array.from({length:240},(_,index)=>{const x=minX+(maxX-minX)*index/239;return{x,y:evaluate(x)};}),minY=Math.min(...samples.map(point=>point.y)),maxY=Math.max(...samples.map(point=>point.y)),range=Math.max(1e-9,maxY-minY);
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 800 360');svg.setAttribute('role','img');svg.setAttribute('aria-label',`${curve.name}: ${curve.x_label} ${minX}–${maxX}, ${curve.y_label} ${minY}–${maxY}`);svg.style.width='100%';
   const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',samples.map((point,index)=>`${index?'L':'M'}${30+(point.x-minX)/(maxX-minX)*740},${330-(point.y-minY)/range*300}`).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke','#9cc9ff');path.setAttribute('stroke-width','3');svg.append(path);root.append(svg);
   const description=document.createElement('p');description.textContent=[curve.description,`${curve.x_label}: ${minX}–${maxX}`,`${curve.y_label}: ${minY}–${maxY}`,curve.interpolation].filter(Boolean).join(' · ');root.append(description);
  }
 };
 if(file.kind==='ink-table-row'){paint([file]);return;}
 const subscription=ink.world.watch({namespace:file.namespace,kind:'ink-table-row',tag:'ink-table:'+file.id,limit:1000},result=>paint(result.objects));await subscription.ready;return()=>subscription.unsubscribe();
}});
