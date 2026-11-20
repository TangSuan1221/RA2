import {radialDeadzone} from '../src/input/buffer.mjs';
export class GamepadInput {
  constructor(){this.previous=[];}
  sample(dt){const pad=navigator.getGamepads?.().find(p=>p?.connected);if(!pad){this.previous=[];return null;}
    const move=radialDeadzone(pad.axes[0]||0,pad.axes[1]||0),look=radialDeadzone(pad.axes[2]||0,pad.axes[3]||0),pressed=pad.buttons.map(b=>b.pressed),commands=[];
    for(const [button,command]of [[0,'execute'],[1,'dodge'],[2,'light'],[3,'heavy'],[4,'parry'],[5,'reload'],[11,'crouch'],[12,'heal'],[13,'prone'],[14,'throw']])if(pressed[button]&&!this.previous[button])commands.push(command);
    this.previous=pressed;return {side:move[0],forward:-move[1],yawDelta:-look[0]*2.5*dt,pitchDelta:-look[1]*1.8*dt,aim:pressed[6],fire:pressed[7],sprint:pressed[10],commands};
  }
}
