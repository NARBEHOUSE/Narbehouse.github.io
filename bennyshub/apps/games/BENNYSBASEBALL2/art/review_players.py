"""Review the authored mesh close up and at its actual game display size."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import build_players as current

OUT = Path(__file__).resolve().parent / 'out'
OUT.mkdir(exist_ok=True)
FONT = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 17)
TITLE = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 26)
SAMPLES = [('BATTING STANCE','stance',0,'batter',270),
           ('CONTACT','swing_normal',5/11,'batter',270),
           ('PITCHER','windup',.46,'pitcher',0),
           ('INFIELDER','fielding_stance',0,'fielder',0),
           ('CATCHER','crouch_idle',0,'catcher',25),
           ('RUNNER','run_side',.25,'runner',270)]

def board(model, filename, display):
    # Render large directly from the mesh; the small view uses the shipped cell.
    im=Image.new('RGB',(1200,800),'#16282d');d=ImageDraw.Draw(im)
    d.text((28,20),'BENNY’S BASEBALL / PLAYER STUDY',font=TITLE,fill='#f0e9da')
    d.text((28,57),'Detail view and actual game size · procedural sprite artwork',font=FONT,fill='#adbdbe')
    for i,(label,name,t,role,yaw) in enumerate(SAMPLES):
        x=(i%3)*400;y=100+(i//3)*345
        d.rounded_rectangle((x+12,y,x+388,y+330),radius=12,fill='#243b40')
        d.text((x+26,y+16),label,font=FONT,fill='#e9ddbe')
        oldsize=model.SIZE
        model.SIZE=384
        rendered=model.render(name,t,role,yaw)
        color=lambda result: model.colorize(result[0],result[2],skin=(167,108,73) if i%2 else (227,169,125))
        detail=color(rendered)
        model.SIZE=oldsize
        # Crop only the close-up, preserving proportions and no upscaling.
        bounds=detail.getbbox();detail=detail.crop(bounds)
        detail.thumbnail((245,248),Image.Resampling.LANCZOS)
        im.paste(detail,(x+38+(220-detail.width)//2,y+55+248-detail.height),detail)
        small=color(model.render(name,t,role,yaw))
        small=small.resize((display,display),Image.Resampling.LANCZOS)
        im.paste(small,(x+285,y+215),small)
        d.text((x+288,y+299),'In game',font=FONT,fill='#adbdbe')
    im.save(OUT/filename)

if __name__=='__main__':
    board(current,'players-detail.png',84)
    print('Player detail review rendered.')
