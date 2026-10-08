import numpy as np, sys, time, multiprocessing as mp
sys.path.insert(0,'.')
import gen
def work(args):
    seed,n=args; np.random.seed(seed); X=np.zeros((n,gen.PW*gen.PH),np.float32); y=np.zeros(n,np.int64)
    for i in range(n):
        p,c=gen.sample(); X[i]=norm(p).ravel(); y[i]=c
    return X,y
def norm(p):
    s=max(np.percentile(p,98),0.25); return np.clip(p/s,0,1.5)
if __name__=='__main__':
    N=int(sys.argv[1]) if len(sys.argv)>1 else 200000
    t=time.time()
    with mp.Pool(4) as pool: parts=pool.map(work,[(s,N//40) for s in range(40)])
    X=np.concatenate([p[0] for p in parts]); y=np.concatenate([p[1] for p in parts]); print('gen',X.shape,round(time.time()-t),'s')
    np.savez_compressed('data.npz',X=X,y=y)
