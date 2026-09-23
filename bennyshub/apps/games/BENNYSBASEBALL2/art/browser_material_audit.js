// Executed in Chrome by check_browser.js, using the shipped runtime tint path.
module.exports = function () {
    const scene = reviewScene, canvas = document.createElement('canvas');
    const board = document.createElement('canvas');board.width=1280;board.height=1024;
    const view=board.getContext('2d');view.fillStyle='#243b40';view.fillRect(0,0,board.width,board.height);
    let frames=0, pixels=0, row=0;
    const read=image=>{
        canvas.width=image.width;canvas.height=image.height;
        const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
        return context.getImageData(0,0,canvas.width,canvas.height).data;
    };
    for(const [sheet,meta] of Object.entries(BASEBALL_ART)) {
        const src=scene.textures.get(sheet).getSourceImage(), before=read(src);
        const masks=read(scene.textures.get(sheet+'-materials').getSourceImage());
        for(const hc of [false,true]) {
            const skin=row%BB2_SKIN_TONES.length;
            const key=bb2VariantTexture(scene,sheet,0x245bc1,0xf0d248,skin,hc);
            const image=scene.textures.get(key).getSourceImage(), after=read(image);
            for(let i=0;i<before.length;i+=4) {
                const expected=hc?Math.max(before[i+3],masks[i+2]):before[i+3];
                if(after[i+3]!==expected)throw Error(sheet+': changed silhouette coverage at '+i);
                // Fully opaque neutral details must survive unchanged, even gray ones.
                if(before[i+3]===255 && masks[i]===0 && masks[i+1]===0) {
                    for(let c=0;c<3;c++)if(before[i+c]!==after[i+c])throw Error(sheet+': damaged neutral material');
                }
                pixels++;
            }
            const sample=[0,Math.floor(meta.anchors.length/2),meta.anchors.length-1];
            sample.forEach((frame,col)=>{
                const x=(col+(hc?3:0))*200+40,y=row*128;
                view.drawImage(image,(frame%8)*BB2_CELL,Math.floor(frame/8)*BB2_CELL,BB2_CELL,BB2_CELL,x,y,128,128);
                view.fillStyle='white';view.font='11px Arial';view.fillText(sheet+' #'+frame+(hc?' HC':''),x-12,y+120);
            });
            // Test variants are transient; don't accumulate large GPU textures.
            scene.textures.remove(key);
        }
        frames+=meta.anchors.length;row++;
    }
    return {frames,pixels,board:board.toDataURL('image/png').split(',')[1]};
};
