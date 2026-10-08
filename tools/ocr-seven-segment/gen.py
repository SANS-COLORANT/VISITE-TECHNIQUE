import numpy as np, cv2
PAT={'0':(1,1,1,1,1,1,0),'1':(0,1,1,0,0,0,0),'2':(1,1,0,1,1,0,1),'3':(1,1,1,1,0,0,1),'4':(0,1,1,0,0,1,1),
     '5':(1,0,1,1,0,1,1),'6':(1,0,1,1,1,1,1),'7':(1,1,1,0,0,0,0),'8':(1,1,1,1,1,1,1),'9':(1,1,1,1,0,1,1)}
KEYS=list('0123456789')
PW,PH=24,40   # patch size (cell +-10 %)
SS=4          # supersampling of the canvas
BAR=[1.0]
def draw_digit(cv,x0,top,Wd,H,key,T,lit,ghost,bevel,right_align=False):
    """draw 7 segments on canvas cv (float, supersampled coords already). ghost: per-seg levels for unlit."""
    pat=PAT[key] if key in PAT else (0,)*7
    t=T; tb=T*bevel
    segs=[(x0+t*.55,top,Wd-1.1*t,tb),                                  # a
          (x0+Wd-t,top+tb*.5,t,H/2-tb*.9),                              # b
          (x0+Wd-t,top+H/2+tb*.4,t,H/2-tb*.9),                          # c
          (x0+t*.55,top+H-tb,Wd-1.1*t,tb),                              # d
          (x0,top+H/2+tb*.4,t,H/2-tb*.9),                               # e
          (x0,top+tb*.5,t,H/2-tb*.9),                                   # f
          (x0+t*.55,top+H/2-tb/2,Wd-1.1*t,tb)]                          # g
    for i,(sx,sy,sw,sh) in enumerate(segs):
        horiz=i in (0,3,6)
        v=lit*np.random.uniform(.85,1.1)*(BAR[0] if horiz else 1.0) if pat[i] else ghost[i]
        if v<=0.01: continue
        x1,y1,x2,y2=int(round(sx)),int(round(sy)),int(round(sx+sw)),int(round(sy+sh))
        cv[max(y1,0):max(y2,0),max(x1,0):max(x2,0)]=np.maximum(cv[max(y1,0):max(y2,0),max(x1,0):max(x2,0)],v)
def sample(rng_cls=None):
    cls=np.random.randint(0,11) if rng_cls is None else rng_cls
    BAR[0]=np.random.uniform(.3,1.0) if np.random.rand()<.8 else 1.0
    H=np.random.uniform(40,110)*SS          # canvas px (supersampled)
    r=np.random.uniform(.42,.8); Wd=H*r
    T=H*np.random.uniform(.11,.22); bevel=np.random.uniform(.45,1.1)
    lit=np.random.uniform(.6,1.2); g=np.random.uniform(0,.5)*lit if np.random.rand()<.75 else 0
    ghost=[g*np.random.uniform(.5,1.3) for _ in range(7)]
    gap=Wd*np.random.uniform(.12,.5)
    cw=int(Wd*3+gap*4+H); ch=int(H*1.8)
    cv=np.zeros((ch,cw),np.float32)
    top=H*.4; x0=Wd+gap*1.5
    # neighbours
    for dx in (-1,1):
        if np.random.rand()<.9:
            nk=KEYS[np.random.randint(10)] if np.random.rand()<.85 else ' '
            nx=x0+dx*(Wd+gap)
            nghost=[g*np.random.uniform(.5,1.3) for _ in range(7)]
            draw_digit(cv,nx,top,Wd,H,nk,T,lit,nghost,bevel)
    # the centre cell
    if cls<10:
        draw_digit(cv,x0,top,Wd,H,KEYS[cls],T,lit,ghost,bevel)
    else:
        kind=np.random.randint(4)
        if kind==0: draw_digit(cv,x0,top,Wd,H,' ',T,lit,ghost,bevel)         # ghost only / empty
        elif kind==1:                                                         # frame / reflection line
            xx=int(x0+np.random.uniform(-.2,1.1)*Wd); cv[int(top-.3*H):int(top+1.3*H),xx:xx+int(T*np.random.uniform(.5,1.2))]=lit*np.random.uniform(.4,1)
        elif kind==2:                                                         # short unit-letter-like blobs
            for _ in range(np.random.randint(1,4)):
                bx=int(x0+np.random.uniform(0,Wd*.8)); bh=int(H*np.random.uniform(.15,.4)); by=int(top+H*np.random.uniform(.5,.8))
                cv[by:by+bh,bx:bx+int(T*np.random.uniform(.6,1.4))]=lit*np.random.uniform(.4,.9)
        else:                                                                 # partial digit (cut in the middle)
            draw_digit(cv,x0,top,Wd,H,KEYS[np.random.randint(10)],T,lit,ghost,bevel)
            cut=int(top+H*np.random.uniform(.38,.55))
            if np.random.rand()<.5: cv[cut:,:]=0
            else: cv[:cut,:]=0
    # frame lines beyond the band / at the sides
    if np.random.rand()<.25: cv[int(top-.45*H):int(top-.38*H),:]=np.maximum(cv[int(top-.45*H):int(top-.38*H),:],lit*np.random.uniform(.5,1))
    if np.random.rand()<.25: cv[int(top+1.38*H):int(top+1.45*H),:]=np.maximum(cv[int(top+1.38*H):int(top+1.45*H),:],lit*np.random.uniform(.5,1))
    if np.random.rand()<.2:  # decimal point
        dx=int(x0+Wd+gap*.35); dy=int(top+H-T); cv[dy:dy+int(T),dx:dx+int(T)]=lit
    # residual slant
    s=np.random.normal(0,.06)
    M=np.float32([[1,s,-s*ch/2],[0,1,0]]); cv=cv2.warpAffine(cv,M,(cw,ch))
    # downsample to working resolution (H~ 40-110 px) then blur + noise
    img=cv2.resize(cv,None,fx=1/SS,fy=1/SS,interpolation=cv2.INTER_AREA)
    sig=np.random.uniform(.5,2.2)*(H/SS)/70
    img=cv2.GaussianBlur(img,(0,0),max(.3,sig))
    img=img+np.random.normal(0,np.random.uniform(.01,.08),img.shape).astype(np.float32)
    img=cv2.GaussianBlur(img,(0,0),np.random.uniform(.4,1.2))
    if np.random.rand()<.3:  # moire-like ripple
        yy,xx=np.mgrid[0:img.shape[0],0:img.shape[1]]; img=img+np.random.uniform(.02,.08)*np.sin(xx*np.random.uniform(.3,1.2)+yy*np.random.uniform(.3,1.2))
    img=np.clip(img,0,1.3)
    # crop the patch around the centre cell with jitter
    h_=H/SS; w_=Wd/SS
    jx=np.random.normal(0,.04)*w_; jy=np.random.normal(0,.05)*h_; jw=1+np.random.normal(0,.08); jh=1+np.random.normal(0,.06)
    cx0=x0/SS+jx - 0.1*w_*jw; cx1=x0/SS+w_*jw+jx + 0.1*w_*jw
    cy0=top/SS+jy-.08*h_*jh; cy1=top/SS+h_*jh+jy+.08*h_*jh
    return patch(img,cx0,cx1,cy0,cy1),cls
def edges(a,b,n,limit):
    e=np.array([int(a+i*(b-a)/n) for i in range(n+1)])
    lo=np.clip(e[:-1],0,limit); hi=np.clip(e[1:],0,limit)
    bad=hi<=lo
    lo=np.where(bad&(lo>=limit),limit-1,lo); hi=np.where(bad,lo+1,hi)
    return lo,hi
def patch(img,x0,x1,y0,y1):
    """area-averaged PWxPH patch of the box (same maths as the Java reader)"""
    H,W=img.shape; II=cv2.integral(img.astype(np.float32)).astype(np.float64)
    xa,xb=edges(x0,x1,PW,W); ya,yb=edges(y0,y1,PH,H)
    S=II[np.ix_(yb,xb)]-II[np.ix_(ya,xb)]-II[np.ix_(yb,xa)]+II[np.ix_(ya,xa)]
    area=(yb-ya)[:,None]*(xb-xa)[None,:]
    return (S/area).astype(np.float32)
if __name__=='__main__':
    np.random.seed(0); tiles=[]
    for c in list(range(11))*3:
        p,_=sample(c); tiles.append(cv2.resize(np.clip(p*200,0,255).astype('uint8'),(72,120),interpolation=cv2.INTER_NEAREST))
    rows=[np.hstack(tiles[i:i+11]) for i in range(0,33,11)]
    cv2.imwrite('/tmp/claude-0/-home-user-VISITE-TECHNIQUE/b237a412-159e-5c3a-b5b2-c459105022da/scratchpad/syn_patches.png',np.vstack(rows))
