export type PhotoUploadPhase='idle'|'preparing'|'uploading'|'processing'|'sending'|'failed';
export type PhotoUploadPresentation={label:string;progress:number;busy:boolean;retry:boolean};

const PRESENTATION:Record<PhotoUploadPhase,PhotoUploadPresentation>={
  idle:{label:'Photo ready to share',progress:0,busy:false,retry:false},
  preparing:{label:'Preparing private upload…',progress:.14,busy:true,retry:false},
  uploading:{label:'Uploading photo…',progress:.46,busy:true,retry:false},
  processing:{label:'Checking and understanding photo…',progress:.76,busy:true,retry:false},
  sending:{label:'Sending photo and caption…',progress:.94,busy:true,retry:false},
  failed:{label:'Upload failed',progress:0,busy:false,retry:true},
};

export function photoUploadPresentation(phase:PhotoUploadPhase):PhotoUploadPresentation{return PRESENTATION[phase];}
