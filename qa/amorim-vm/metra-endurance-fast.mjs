import { remote } from 'webdriverio';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const HOST = process.env.APPIUM_HOST || '127.0.0.1';
const PORT = Number(process.env.APPIUM_PORT || 4723);
const DEVICE = process.env.DEVICE_NAME || 'emulator-5554';
const PACKAGE = process.env.APP_PACKAGE || 'com.sanscolorant.visitetechnique';
const MAX_ACTIONS = Number(process.env.MAX_ACTIONS || 25000);
const MAX_RUNTIME_MIN = Number(process.env.MAX_RUNTIME_MIN || 480);
const ACTION_DELAY_MS = Number(process.env.ACTION_DELAY_MS || 60);
const SOURCE_EVERY = Number(process.env.SOURCE_EVERY || 5);
const STUCK_SECONDS = Number(process.env.STUCK_SECONDS || 12);
const MAX_RECOVERIES = Number(process.env.MAX_RECOVERIES || 250);
const OUT = path.resolve(process.env.ARTIFACT_ROOT || 'qa/amorim-vm/artifacts-fast', new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(OUT,{recursive:true});

let driver;
const s={start:Date.now(),actions:0,transitions:0,lastHash:'',lastChange:Date.now(),screens:new Set(),recoveries:0,restarts:0,sessions:0,coverage:{},failures:[],events:[]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hash=x=>crypto.createHash('sha1').update(x||'').digest('hex');
const bump=k=>s.coverage[k]=(s.coverage[k]||0)+1;
const log=(event,data={})=>{const row={ts:new Date().toISOString(),event,...data};s.events.push(row);console.log(JSON.stringify(row));};
const mins=()=>((Date.now()-s.start)/60000);
const save=()=>fs.writeFileSync(path.join(OUT,'live-report.json'),JSON.stringify(report(),null,2));

async function start(){driver=await remote({hostname:HOST,port:PORT,path:'/',logLevel:'error',connectionRetryTimeout:15000,connectionRetryCount:1,capabilities:{platformName:'Android','appium:automationName':'UiAutomator2','appium:deviceName':DEVICE,'appium:appPackage':PACKAGE,'appium:noReset':true,'appium:newCommandTimeout':300,'appium:autoGrantPermissions':true,'appium:disableWindowAnimation':true,'appium:waitForIdleTimeout':0,'appium:waitForSelectorTimeout':800,'appium:uiautomator2ServerInstallTimeout':20000}});}

async function inspect(force=false){if(!force && s.actions%SOURCE_EVERY!==0)return '';const src=await driver.getPageSource();const h=hash(src.replace(/bounds="[^"]+"/g,''));if(s.lastHash&&h!==s.lastHash){s.transitions++;s.lastChange=Date.now();}s.lastHash=h;s.screens.add(h);return src;}
async function dump(reason){try{fs.writeFileSync(path.join(OUT,`${Date.now()}-${reason}.xml`),await driver.getPageSource());}catch{}try{await driver.saveScreenshot(path.join(OUT,`${Date.now()}-${reason}.png`));}catch{}try{fs.writeFileSync(path.join(OUT,`${Date.now()}-${reason}-logcat.json`),JSON.stringify((await driver.getLogs('logcat')).slice(-1500),null,2));}catch{}}
async function watchdog(){if(mins()>MAX_RUNTIME_MIN)throw new Error('runtime-limit');if((Date.now()-s.lastChange)/1000<=STUCK_SECONDS)return;s.recoveries++;log('watchdog',{recoveries:s.recoveries,actions:s.actions});await dump(`watchdog-${s.recoveries}`);if(s.recoveries>MAX_RECOVERIES)throw new Error('recovery-limit');for(let i=0;i<2;i++){try{await driver.back();await sleep(150);await inspect(true);s.lastChange=Date.now();return;}catch{}}try{await driver.terminateApp(PACKAGE);await sleep(250);await driver.activateApp(PACKAGE);await sleep(600);s.restarts++;s.lastChange=Date.now();return;}catch{}try{await driver.deleteSession();}catch{}await start();s.sessions++;s.lastChange=Date.now();}
async function acted(key){s.actions++;bump(key);await sleep(ACTION_DELAY_MS);await inspect();await watchdog();if(s.actions%250===0){save();log('progress',{actions:s.actions,transitions:s.transitions,screens:s.screens.size,recoveries:s.recoveries});}}

async function click(el,key){try{if(!(await el.isDisplayed()))return false;await el.click();await acted(key);return true;}catch(e){s.failures.push({a:s.actions,key,error:String(e)});return false;}}
async function byText(text,key){const q=text.replace(/'/g,"\\'");for(const sel of [`//*[@text='${q}']`,`//*[@content-desc='${q}']`,`//*[contains(@text,'${q}')]`]){try{const el=await driver.$(sel);if(await el.isExisting())return await click(el,key);}catch{}}return false;}
async function randomClick(){try{const a=await driver.$$('//*[@clickable="true" and @enabled="true"]');if(!a.length)return false;return click(a[Math.floor(Math.random()*a.length)],'random');}catch{return false;}}
async function fill(){try{const a=await driver.$$('//android.widget.EditText');for(let i=0;i<Math.min(a.length,8)&&s.actions<MAX_ACTIONS;i++){try{if(!(await a[i].isDisplayed()))continue;await a[i].click();await a[i].setValue(`AMORIM-${s.actions}-${i}`);try{await driver.hideKeyboard();}catch{}await acted('input');}catch{}}}catch{}}
async function swipe(up=false){try{const z=await driver.getWindowSize(),x=Math.floor(z.width*.5),y1=Math.floor(z.height*(up?.30:.78)),y2=Math.floor(z.height*(up?.78:.30));await driver.performActions([{type:'pointer',id:'f',parameters:{pointerType:'touch'},actions:[{type:'pointerMove',duration:0,x,y:y1},{type:'pointerDown',button:0},{type:'pause',duration:40},{type:'pointerMove',duration:160,x,y:y2},{type:'pointerUp',button:0}]}]);await driver.releaseActions();await acted(up?'swipe_up':'swipe_down');return true;}catch{return false;}}

const focus=[['Visites','visites'],['Ajouter','add'],['S','S'],['N.S','NS'],['N.R','NR'],['S.O','SO'],['Réserves','reserves'],['Remarques','remarks'],['Photos','photos'],['Matériel','equipment'],['Régulation','regulation'],['Relevés','readings'],['VMC','vmc'],['Pré-allumage','preallumage'],['Patrimoine','patrimoine'],['Documents','documents'],['Rapport','report'],['PDF','pdf'],['Excel','excel'],['Word','word'],['LAB','lab'],['3D','3d'],['Paramètres','settings'],['Enregistrer','save']];

async function coveragePass(){for(const [t,k] of focus){if(s.actions>=MAX_ACTIONS)return;await byText(t,k);await fill();await swipe(false);await driver.back().catch(()=>{});await sleep(ACTION_DELAY_MS);await inspect();}}
async function heavyVisit(pass){log('visit_start',{pass,actions:s.actions});await byText('Visites','visites');await byText('Ajouter','visit_add');await fill();for(let section=0;section<30&&s.actions<MAX_ACTIONS;section++){for(const [t,k] of focus.slice(2,12)){if(s.actions>=MAX_ACTIONS)break;await byText(t,k);}await fill();for(let i=0;i<12&&s.actions<MAX_ACTIONS;i++)await randomClick();await swipe(section%2===0);if(section%5===0)save();}await byText('Enregistrer','save');await driver.back().catch(()=>{});await inspect(true);log('visit_end',{pass,actions:s.actions});}
async function chaos(){while(s.actions<MAX_ACTIONS&&mins()<MAX_RUNTIME_MIN){const r=Math.random();if(r<.62)await randomClick();else if(r<.78)await swipe(false);else if(r<.90)await swipe(true);else if(r<.97)await fill();else{await driver.back().catch(()=>{});await acted('back');}}}
function report(){return{device:DEVICE,package:PACKAGE,maxActions:MAX_ACTIONS,actions:s.actions,minutes:+mins().toFixed(2),transitions:s.transitions,uniqueScreens:s.screens.size,recoveries:s.recoveries,appRestarts:s.restarts,sessionRestarts:s.sessions,coverage:s.coverage,failures:s.failures.slice(-1000)};}

try{await start();await inspect(true);await coveragePass();let pass=1;while(s.actions<MAX_ACTIONS*.7&&pass<=80)await heavyVisit(pass++);await chaos();}catch(e){s.failures.push({fatal:String(e),stack:e?.stack});await dump('fatal').catch(()=>{});}finally{fs.writeFileSync(path.join(OUT,'final-report.json'),JSON.stringify(report(),null,2));fs.writeFileSync(path.join(OUT,'events.json'),JSON.stringify(s.events,null,2));try{await driver?.deleteSession();}catch{}}
console.log(JSON.stringify(report(),null,2));process.exit(s.actions>=Math.min(MAX_ACTIONS,5000)?0:2);
