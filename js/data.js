// ===== MATERIAL & EMISSION FACTOR DATA =====
const MATERIALS = {
  Concrete:{unit:"m\u00b3",massFactor:2400,efUnit:"kgCO\u2082e/m\u00b3",types:[
    {name:"C15-20",baseline:323,target:220},{name:"C20-30",baseline:354,target:301},{name:"C30-40",baseline:431,target:340},
    {name:"C40-50",baseline:430,target:360},{name:"C50-60",baseline:483,target:342},{name:"C60-70",baseline:522,target:345}]},
  Steel:{unit:"kg",massFactor:1,efUnit:"kgCO\u2082e/kg",types:[
    {name:"Structural (I sections)",baseline:2.46,target:1.78},{name:"Rebar",baseline:2.26,target:1.30},
    {name:"Hollow (Tube) sections",baseline:2.52,target:1.83},{name:"Hot Dip Galvanized",baseline:2.74,target:2.07}]},
  Asphalt:{unit:"tons",massFactor:1000,efUnit:"kgCO\u2082e/ton",types:[
    {name:"3% Binder",baseline:50.1,target:40.08},{name:"3.5% Binder",baseline:51.1,target:40.88},{name:"4% Binder",baseline:52.2,target:41.76},
    {name:"4.5% Binder",baseline:53.2,target:42.56},{name:"5% Binder",baseline:54.2,target:43.36},{name:"5.5% Binder",baseline:55.3,target:44.24},
    {name:"6% Binder",baseline:56.3,target:45.04},{name:"6.5% Binder",baseline:57.3,target:45.84},{name:"7% Binder",baseline:58.4,target:46.72}]},
  Aluminum:{unit:"kg",massFactor:1,efUnit:"kgCO\u2082e/kg",types:[
    {name:"Profile Without Coating",baseline:8.24,target:6.59},{name:"Profile With Coating",baseline:9.12,target:7.30},
    {name:"Sheets Without Coating",baseline:7.85,target:6.28},{name:"Anodized Sections",baseline:10.20,target:8.16}]},
  Glass:{unit:"kg",massFactor:1,efUnit:"kgCO\u2082e/kg",types:[
    {name:"Annealed",baseline:1.30,target:1.04},{name:"Coated",baseline:1.60,target:1.28},
    {name:"Laminated",baseline:1.80,target:1.44},{name:"IGU",baseline:2.50,target:2.00}]},
  Pipes:{unit:"m",massFactor:1,efUnit:"kgCO\u2082e/m",types:[
    {name:"Precast 600mm",baseline:138.89,target:138.89},{name:"Precast 800mm",baseline:241.29,target:241.29},
    {name:"Precast 1000mm",baseline:394.70,target:394.70},{name:"Precast 1200mm",baseline:543.80,target:543.80}]},
  Earthwork:{unit:"tons",massFactor:1000,efUnit:"kgCO\u2082e/ton",types:[
    {name:"Excavation/Hauling",baseline:3.50,target:2.80},{name:"Coarse Aggregate",baseline:5.20,target:4.16},{name:"Sand",baseline:4.80,target:3.84}]},
};

const A5_EFS = {
  energy:[{name:"Diesel",ef:2.51,unit:"L",efUnit:"kgCO\u2082e/L"},{name:"Gasoline",ef:2.31,unit:"L",efUnit:"kgCO\u2082e/L"},{name:"Grid Electricity",ef:0.611,unit:"kWh",efUnit:"kgCO\u2082e/kWh"},{name:"Renewable",ef:0,unit:"kWh",efUnit:"kgCO\u2082e/kWh"}],
  water:[{name:"Potable Water",ef:14.7,unit:"m\u00b3",efUnit:"kgCO\u2082/m\u00b3"},{name:"Construction Water",ef:4.0,unit:"m\u00b3",efUnit:"kgCO\u2082/m\u00b3"},{name:"TSE Recycled",ef:1.2,unit:"m\u00b3",efUnit:"kgCO\u2082/m\u00b3"}]
};

const TEF={road:0.0000121,sea:0.0000026,train:0.0000052};
const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CERTS=[{name:"Envision",icon:"\ud83c\udfd7\ufe0f",color:"var(--green)",cr:14,tgt:10},{name:"Mostadam",icon:"\ud83c\udfe0",color:"var(--cyan)",cr:8,tgt:6},{name:"LEED",icon:"\ud83c\udf3f",color:"var(--green)",cr:12,tgt:8},{name:"BREEAM",icon:"\ud83c\udf0d",color:"var(--blue)",cr:10,tgt:7},{name:"WELL",icon:"\ud83d\udc9a",color:"var(--purple)",cr:6,tgt:4}];
