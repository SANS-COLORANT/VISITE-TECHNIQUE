const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.join(__dirname, '../..');
const source = fs.readFileSync(path.join(root,'plugins/withMetraDexR8.js'),'utf8');
const appConfig = fs.readFileSync(path.join(root,'app.config.js'),'utf8');

function evaluatePlugin(toggle) {
  let calls = 0;
  const module = { exports: {} };
  const context = {
    module,
    exports:module.exports,
    process:{env: {METRA_EXPERIMENTAL_R8: toggle}},
    require(name) {
      assert.equal(name,'@expo/config-plugins');
      return { withGradleProperties(config, fn) {
        calls++;
        const gradle = { modResults: [
          {type:'property',key:'android.enableMinifyInReleaseBuilds',value:'false'},
          {type:'property',key:'android.enableShrinkResourcesInReleaseBuilds',value:'false'},
        ] };
        const next = fn(gradle);
        return {...config, gradleProperties:next.modResults};
      }};
    }
  };
  vm.runInNewContext(source, context);
  return {plugin:module.exports,calls:()=>calls};
}

test('Normal build leaves R8 disabled and configuration unchanged', () => {
  const { plugin,calls } = evaluatePlugin('0');
  const original = {name:'METRA'};
  assert.strictEqual(plugin(original),original);
  assert.equal(calls(),0);
});

test('Pilot build enables Dex R8 exactly once and leaves resource shrinking off', () => {
  const {plugin,calls} = evaluatePlugin('1');
  const out=plugin({name:'METRA'});
  assert.equal(calls(),1);
  const entries=out.gradleProperties.filter(x=>x.type==='property');
  const keys=entries.map(x=>x.key);
  assert.equal(keys.filter(x=>x==='android.enableMinifyInReleaseBuilds').length,1);
  assert.equal(keys.filter(x=>x==='android.enableShrinkResourcesInReleaseBuilds').length,1);
  assert.equal(entries.find(x=>x.key==='android.enableMinifyInReleaseBuilds').value,'true');
  assert.equal(entries.find(x=>x.key==='android.enableShrinkResourcesInReleaseBuilds').value,'false');
});

test('Only R8 experiment loads the plugin in Expo app config', () => {
  assert.match(appConfig,/process\.env\.METRA_EXPERIMENTAL_R8 === '1'/);
  assert.match(appConfig,/plugins\.push\('\.\/plugins\/withMetraDexR8'\)/);
  const config = JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));
  assert.equal(config.expo.newArchEnabled,false);
  assert.equal(config.expo.android.package,'com.visitetechnique.tablet');
});
