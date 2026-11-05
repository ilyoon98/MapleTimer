import {createStore} from "../state/createStore";
export const buffLocationStore=createStore({open:false});
export const openBuffLocation=()=>buffLocationStore.set({open:true});
export const closeBuffLocation=()=>buffLocationStore.set({open:false});
