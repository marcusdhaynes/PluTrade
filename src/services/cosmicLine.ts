import type {IChartApi,ISeriesApi,Time} from 'lightweight-charts';

/** Draw a crisp height-based cosmic gradient in the native plot's own
 * coordinate system; axes, crosshair, pan, zoom and autoscale stay native. */
export function attachCosmicLine(chart:IChartApi,series:ISeriesApi<any>){
  const renderer={
    draw(target:any){
      target.useMediaCoordinateSpace(({context:ctx,mediaSize}:any)=>{
        const range=chart.timeScale().getVisibleLogicalRange();
        if(!range||mediaSize.height<=0||mediaSize.width<=0)return;
        const data=series.data() as readonly {time:Time;value?:number}[];
        const start=Math.max(0,Math.floor(range.from)-2);
        const end=Math.min(data.length,Math.ceil(range.to)+3);
        const points:Array<{x:number;y:number}>=[];
        for(let i=start;i<end;i++){
          const p=data[i];
          if(!Number.isFinite(p.value))continue;
          const x=chart.timeScale().timeToCoordinate(p.time);
          const y=series.priceToCoordinate(p.value!);
          if(x!==null&&y!==null&&Number.isFinite(x)&&Number.isFinite(y))points.push({x,y});
        }
        if(points.length<2)return;
        let top=Infinity,bottom=-Infinity;
        for(const p of points){top=Math.min(top,p.y);bottom=Math.max(bottom,p.y);}
        const gradient=ctx.createLinearGradient(0,top,0,Math.max(top+1,bottom));
        gradient.addColorStop(0,'#be22fa');
        gradient.addColorStop(.30,'#8a39ff');
        gradient.addColorStop(.58,'#6658ff');
        gradient.addColorStop(.82,'#3886f6');
        gradient.addColorStop(1,'#00b9e9');
        ctx.save();
        ctx.beginPath();ctx.rect(0,0,mediaSize.width,mediaSize.height);ctx.clip();
        ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
        for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);
        ctx.strokeStyle=gradient;ctx.lineWidth=1.35;ctx.lineJoin='round';ctx.lineCap='round';
        ctx.stroke();ctx.restore();
      });
    }
  };
  series.attachPrimitive({paneViews:()=>[{zOrder:()=> 'normal' as const,renderer:()=>renderer}]});
}
