import {useCallback,useEffect,useRef,useSyncExternalStore} from 'react';
import type {Dispatch,SetStateAction} from 'react';

// A single owner for independent workspace windows, across every component
// and breakpoint. Closing a stale/non-owning window never closes its successor.
type ActiveWindow={owner:symbol;value:unknown};
let active:ActiveWindow|null=null;
const listeners=new Set<()=>void>();
const subscribe=(listener:()=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener);};};
const publish=(next:ActiveWindow|null)=>{
  if(active===next)return;
  active=next;
  for(const listener of [...listeners])listener();
};

export function useExclusiveWindow<T>(closed:T):[T,Dispatch<SetStateAction<T>>]{
  const owner=useRef(Symbol('workspace-window')).current;
  const snapshot=useCallback(()=>active?.owner===owner?active.value as T:closed,[owner,closed]);
  const value=useSyncExternalStore(subscribe,snapshot,()=>closed);
  const set=useCallback<Dispatch<SetStateAction<T>>>(update=>{
    const previous=active?.owner===owner?active.value as T:closed;
    const next=typeof update==='function'?(update as (prev:T)=>T)(previous):update;
    if(Object.is(next,closed)){
      if(active?.owner===owner)publish(null);
    }else if(active?.owner!==owner||!Object.is(active.value,next)){
      publish({owner,value:next});
    }
  },[owner,closed]);
  useEffect(()=>()=>{if(active?.owner===owner)publish(null);},[owner]);
  return [value,set];
}
