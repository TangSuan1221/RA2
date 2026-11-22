import saved from './saved.json';
export function placed(scene,id,original){return saved[scene]?.[id]?.transform??original}
