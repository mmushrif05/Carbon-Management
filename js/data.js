// ===== MATERIAL & EMISSION FACTOR DATA =====
// These are the FIXED A1-A3 categories — do NOT modify unless explicitly instructed.
const MATERIALS = {
  Concrete:{unit:"m³",massFactor:2400,efUnit:"kgCO₂e/m³",types:[
    {name:"C15-20",baseline:323,target:220},{name:"C20-30",baseline:354,target:301},{name:"C30-40",baseline:431,target:340},
    {name:"C40-50",baseline:430,target:360},{name:"C40-50 (PCC-C45)",baseline:430,target:360},
    {name:"C50-60",baseline:483,target:342},{name:"C60-70",baseline:522,target:345}]},
  Steel:{unit:"kg",massFactor:1,efUnit:"kgCO₂e/kg",types:[
    {name:"Structural (I sections)",baseline:2.46,target:1.78},{name:"Rebar",baseline:2.26,target:1.30},
    {name:"Hollow (Tube) sections",baseline:2.52,target:1.83},{name:"Hot Dip Galvanized",baseline:2.74,target:2.07}]},
  Asphalt:{unit:"tons",massFactor:1000,efUnit:"kgCO₂e/ton",types:[
    {name:"3% Binder",baseline:50.1,target:40.08},{name:"3.5% Binder",baseline:51.1,target:40.88},{name:"4% Binder",baseline:52.2,target:41.76},
    {name:"4.5% Binder",baseline:53.2,target:42.56},{name:"5% Binder",baseline:54.2,target:43.36},{name:"5.5% Binder",baseline:55.3,target:44.24},
    {name:"6% Binder",baseline:56.3,target:45.04},{name:"6.5% Binder",baseline:57.3,target:45.84},{name:"7% Binder",baseline:58.4,target:46.72}]},
  Aluminum:{unit:"kg",massFactor:1,efUnit:"kgCO₂e/kg",types:[
    {name:"Profile Without Coating (Sections)",baseline:10.8,target:7.2},{name:"Profile With Coating (Sections)",baseline:10.8,target:8.6},
    {name:"Profile Anodized (Sections)",baseline:10.8,target:10.7},{name:"Sheets Without Coating",baseline:13.5,target:13.5},
    {name:"Sheets With Coating",baseline:12.9,target:12.9}]},
  Glass:{unit:"kg",massFactor:1,efUnit:"kgCO₂e/kg",types:[
    {name:"Basis Annealed",baseline:1.28,target:1.17},{name:"Coated",baseline:1.61,target:1.39},
    {name:"Laminated",baseline:1.77,target:1.64},{name:"Specialty",baseline:1.84,target:1.66},{name:"IGU",baseline:4.12,target:2.76}]},
  Earth_Work:{unit:"tkm",massFactor:1,efUnit:"kgCO₂/tkm",types:[
    {name:"Excavation/Hauling",baseline:0.11,target:0.11},{name:"Demolition Removal",baseline:0.11,target:0.11}]},
  Subgrade:{unit:"kg",massFactor:1,efUnit:"kgCO₂e/kg",types:[
    {name:"Coarse & Fine Aggregate (Recycled)",baseline:0.0006,target:0.0006},{name:"Coarse Aggregate",baseline:0.0103,target:0.0103},
    {name:"Sand (River Sand)",baseline:0.0052,target:0.0052}]},
  Pipes:{unit:"m",massFactor:1,efUnit:"kgCO₂e/m",types:[
    {name:"Precast Concrete Pipe 600mm",baseline:179.895,target:179.895},{name:"Precast Concrete Pipe 700mm",baseline:241.292,target:241.292},
    {name:"Precast Concrete Pipe 800mm",baseline:307.164,target:307.164},{name:"Precast Concrete Pipe 900mm",baseline:394.695,target:394.695},
    {name:"Precast Concrete Pipe 1000mm",baseline:436.223,target:436.223},{name:"Precast Concrete Pipe 1100mm",baseline:490.997,target:490.997},
    {name:"Precast Concrete Pipe 1200mm",baseline:543.802,target:543.802},{name:"Precast Concrete Pipe 1400mm",baseline:735.690,target:735.690},
    {name:"Precast Concrete Pipe 1500mm",baseline:814.092,target:814.092},{name:"Precast Concrete Pipe 1800mm",baseline:1138.261,target:1138.261},
    {name:"Precast Concrete Pipe 2000mm",baseline:1409.267,target:1409.267},{name:"Precast Concrete Pipe Other Diameter",baseline:0,target:0}]},
};

const A5_EFS = {
  energy:[{name:"Diesel",ef:2.51,unit:"L",efUnit:"kgCO\u2082e/L"},{name:"Gasoline",ef:2.31,unit:"L",efUnit:"kgCO\u2082e/L"},{name:"Grid Electricity",ef:0.611,unit:"kWh",efUnit:"kgCO\u2082e/kWh"},{name:"Renewable",ef:0,unit:"kWh",efUnit:"kgCO\u2082e/kWh"}],
  water:[{name:"Potable Water",ef:14.7,unit:"m\u00b3",efUnit:"kgCO\u2082/m\u00b3"},{name:"Construction Water",ef:4.0,unit:"m\u00b3",efUnit:"kgCO\u2082/m\u00b3"},{name:"TSE Recycled",ef:1.2,unit:"m\u00b3",efUnit:"kgCO\u2082/m\u00b3"}]
};

const TEF={road:0.0000121,sea:0.0000026,train:0.0000052};
const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CERTS=[{name:"Envision",icon:"\ud83c\udfd7\ufe0f",color:"var(--green)",cr:14,tgt:10},{name:"Mostadam",icon:"\ud83c\udfe0",color:"var(--cyan)",cr:8,tgt:6},{name:"LEED",icon:"\ud83c\udf3f",color:"var(--green)",cr:12,tgt:8},{name:"BREEAM",icon:"\ud83c\udf0d",color:"var(--blue)",cr:10,tgt:7},{name:"WELL",icon:"\ud83d\udc9a",color:"var(--purple)",cr:6,tgt:4}];

// =====================================================================
// ICE DATABASE v3.0 — FOR TENDER / BOQ USE ONLY
// This is SEPARATE from MATERIALS and does NOT affect A1-A3 entry.
// Source: University of Bath / Circular Ecology
// MEP items with coveragePct < 80% have A1-A3 = 0 (complex assemblies)
// =====================================================================
const ICE_COVERAGE_THRESHOLD = 80;

const ICE_MATERIALS = {
  // ── STRUCTURAL ──
  Concrete:{unit:"m\u00b3",massFactor:2400,efUnit:"kgCO\u2082e/m\u00b3",group:"Structural",types:[
    {name:"C8-10 (Lean Mix / Blinding)",baseline:175,target:140},
    {name:"C12-15 (Mass Fill)",baseline:227,target:182},
    {name:"C15-20",baseline:323,target:220},
    {name:"C20-25 (RC25)",baseline:340,target:272},
    {name:"C20-30",baseline:354,target:301},
    {name:"C25-30 (RC28/32)",baseline:370,target:296},
    {name:"C28-35 (RC32/40)",baseline:390,target:312},
    {name:"C30-37 (Structural)",baseline:410,target:328},
    {name:"C30-40",baseline:431,target:340},
    {name:"C32-40 (Post-Tensioned)",baseline:440,target:352},
    {name:"C35-45 (High Strength)",baseline:455,target:350},
    {name:"C40-50",baseline:430,target:360},
    {name:"C45-55 (Precast)",baseline:470,target:340},
    {name:"C50-60",baseline:483,target:342},
    {name:"C60-70",baseline:522,target:345},
    {name:"C70-85 (Ultra High Performance)",baseline:580,target:406},
    {name:"Precast Concrete (General)",baseline:388,target:310},
    {name:"Lightweight Concrete (LC8-16)",baseline:280,target:224},
    {name:"Fibre Reinforced Concrete",baseline:420,target:336},
    {name:"Concrete Block (Dense)",baseline:94,target:75},
    {name:"Concrete Block (Lightweight AAC)",baseline:120,target:96},
    {name:"Concrete Block (Medium Dense)",baseline:100,target:80}]},
  Steel:{unit:"kg",massFactor:1,efUnit:"kgCO\u2082e/kg",group:"Structural",types:[
    {name:"Structural (I/H Sections)",baseline:2.46,target:1.78},
    {name:"Rebar (Reinforcing Bar)",baseline:2.26,target:1.30},
    {name:"Hollow (Tube) Sections (SHS/RHS/CHS)",baseline:2.52,target:1.83},
    {name:"Hot Dip Galvanized",baseline:2.74,target:2.07},
    {name:"Cold Rolled Coil",baseline:2.83,target:2.12},
    {name:"Hot Rolled Coil",baseline:2.36,target:1.77},
    {name:"Steel Plate",baseline:2.44,target:1.83},
    {name:"Stainless Steel (304)",baseline:6.15,target:4.92},
    {name:"Stainless Steel (316)",baseline:6.57,target:5.26},
    {name:"Wire Rod",baseline:2.30,target:1.73},
    {name:"Steel Decking (Composite)",baseline:2.78,target:2.08},
    {name:"Steel Purlins",baseline:2.62,target:1.96},
    {name:"Welded Mesh",baseline:2.44,target:1.83},
    {name:"Steel Sheet Piles",baseline:2.50,target:1.87}]},
  Timber:{unit:"m\u00b3",massFactor:500,efUnit:"kgCO\u2082e/m\u00b3",group:"Structural",types:[
    {name:"Sawn Softwood (General)",baseline:263,target:210},
    {name:"Sawn Hardwood (General)",baseline:375,target:300},
    {name:"Glulam (Glued Laminated)",baseline:512,target:410},
    {name:"CLT (Cross Laminated Timber)",baseline:437,target:350},
    {name:"LVL (Laminated Veneer Lumber)",baseline:530,target:424},
    {name:"Plywood (Softwood)",baseline:610,target:488},
    {name:"Plywood (Hardwood)",baseline:680,target:544},
    {name:"OSB (Oriented Strand Board)",baseline:540,target:432},
    {name:"MDF (Medium Density Fibreboard)",baseline:592,target:474},
    {name:"Chipboard / Particleboard",baseline:467,target:374},
    {name:"Timber I-Joists",baseline:490,target:392},
    {name:"Timber Cladding (Treated)",baseline:350,target:280}]},
  // ── MASONRY & CERAMICS ──
  Masonry:{unit:"kg",massFactor:1,efUnit:"kgCO\u2082e/kg",group:"Masonry & Ceramics",types:[
    {name:"Common Brick (Fired Clay)",baseline:0.24,target:0.19},
    {name:"Engineering Brick",baseline:0.31,target:0.25},
    {name:"Facing Brick",baseline:0.29,target:0.23},
    {name:"Sand Lime Brick (Calcium Silicate)",baseline:0.17,target:0.14},
    {name:"Concrete Brick",baseline:0.12,target:0.10},
    {name:"Mortar (1:3 Cement:Sand)",baseline:0.20,target:0.16},
    {name:"Mortar (1:6 Cement:Sand)",baseline:0.14,target:0.11},
    {name:"Mortar (1:1:6 Cement:Lime:Sand)",baseline:0.16,target:0.13},
    {name:"Natural Stone (Limestone)",baseline:0.09,target:0.07},
    {name:"Natural Stone (Granite)",baseline:0.70,target:0.56},
    {name:"Natural Stone (Marble)",baseline:0.12,target:0.10},
    {name:"Natural Stone (Sandstone)",baseline:0.06,target:0.05},
    {name:"Natural Stone (Slate)",baseline:0.03,target:0.02}]},
  Ceramics:{unit:"kg",massFactor:1,efUnit:"kgCO\u2082e/kg",group:"Masonry & Ceramics",types:[
    {name:"Ceramic Floor Tiles",baseline:0.78,target:0.62},
    {name:"Ceramic Wall Tiles",baseline:0.75,target:0.60},
    {name:"Porcelain Tiles",baseline:0.90,target:0.72},
    {name:"Roof Tiles (Clay)",baseline:0.46,target:0.37},
    {name:"Roof Tiles (Concrete)",baseline:0.25,target:0.20},
    {name:"Sanitary Ware (Vitreous China)",baseline:1.61,target:1.29},
    {name:"Terracotta Panels",baseline:0.52,target:0.42}]},
  // ── CEMENT & BINDERS ──
  Cement:{unit:"kg",massFactor:1,efUnit:"kgCO\u2082e/kg",group:"Cement & Binders",types:[
    {name:"Portland Cement (CEM I)",baseline:0.91,target:0.73},
    {name:"CEM II/A (6-20% Addition)",baseline:0.76,target:0.61},
    {name:"CEM II/B (21-35% Addition)",baseline:0.63,target:0.50},
    {name:"CEM III/A (36-65% GGBS)",baseline:0.45,target:0.36},
    {name:"CEM III/B (66-80% GGBS)",baseline:0.32,target:0.26},
    {name:"GGBS (Ground Granulated Blast-furnace Slag)",baseline:0.07,target:0.06},
    {name:"PFA / Fly Ash",baseline:0.01,target:0.01},
    {name:"Lime (Calcium Oxide)",baseline:0.76,target:0.61},
    {name:"Hydraulic Lime",baseline:0.59,target:0.47},
    {name:"Calcium Aluminate Cement",baseline:1.10,target:0.88}]},
  // ── METALS ──
  Aluminum:{unit:"kg",massFactor:1,efUnit:"kgCO\u2082e/kg",group:"Metals",types:[
    {name:"General (World Average)",baseline:9.16,target:7.33},
    {name:"Profile Without Coating",baseline:8.24,target:6.59},
    {name:"Profile With Coating (Powder/Anodized)",baseline:9.12,target:7.30},
    {name:"Sheets Without Coating",baseline:7.85,target:6.28},
    {name:"Anodized Sections",baseline:10.20,target:8.16},
    {name:"Cast Aluminum",baseline:11.50,target:9.20},
    {name:"Extruded Aluminum",baseline:8.57,target:6.86},
    {name:"Recycled Aluminum (Secondary)",baseline:1.69,target:1.35}]},
  Copper:{unit:"kg",massFactor:1,efUnit:"kgCO\u2082e/kg",group:"Metals",types:[
    {name:"Copper (General, Virgin)",baseline:3.81,target:3.05},
    {name:"Copper Pipe",baseline:3.01,target:2.41},
    {name:"Copper Sheet",baseline:3.50,target:2.80},
    {name:"Copper Wire",baseline:3.20,target:2.56},
    {name:"Brass (Cu-Zn Alloy)",baseline:3.70,target:2.96},
    {name:"Bronze",baseline:3.50,target:2.80},
    {name:"Recycled Copper (Secondary)",baseline:1.40,target:1.12}]},
  "Other Metals":{unit:"kg",massFactor:1,efUnit:"kgCO\u2082e/kg",group:"Metals",types:[
    {name:"Lead (Sheet)",baseline:1.57,target:1.26},
    {name:"Lead (Pipe)",baseline:1.67,target:1.34},
    {name:"Zinc (General)",baseline:3.09,target:2.47},
    {name:"Zinc (Galvanizing)",baseline:2.80,target:2.24},
    {name:"Tin",baseline:16.00,target:12.80},
    {name:"Iron (Cast)",baseline:1.91,target:1.53},
    {name:"Iron (Wrought)",baseline:2.03,target:1.62}]},
  // ── GLASS ──
  Glass:{unit:"kg",massFactor:1,efUnit:"kgCO\u2082e/kg",group:"Envelope",types:[
    {name:"Float Glass (Annealed)",baseline:1.30,target:1.04},
    {name:"Toughened / Tempered Glass",baseline:1.67,target:1.34},
    {name:"Coated Glass (Low-E)",baseline:1.60,target:1.28},
    {name:"Laminated Glass",baseline:1.80,target:1.44},
    {name:"IGU (Insulated Glass Unit, Double)",baseline:2.50,target:2.00},
    {name:"IGU (Triple Glazed)",baseline:3.20,target:2.56},
    {name:"Glass Fibre / Fibreglass",baseline:1.54,target:1.23},
    {name:"Glass Wool Insulation",baseline:1.35,target:1.08}]},
  // ── INSULATION ──
  Insulation:{unit:"kg",massFactor:1,efUnit:"kgCO\u2082e/kg",group:"Envelope",types:[
    {name:"EPS (Expanded Polystyrene)",baseline:3.29,target:2.63},
    {name:"XPS (Extruded Polystyrene)",baseline:3.49,target:2.79},
    {name:"PIR (Polyisocyanurate Board)",baseline:4.26,target:3.41},
    {name:"PUR (Polyurethane Foam)",baseline:4.20,target:3.36},
    {name:"Mineral / Rock Wool",baseline:1.12,target:0.90},
    {name:"Glass Wool",baseline:1.35,target:1.08},
    {name:"Phenolic Foam",baseline:3.70,target:2.96},
    {name:"Cellulose (Recycled Paper)",baseline:0.20,target:0.16},
    {name:"Cork",baseline:0.19,target:0.15},
    {name:"Sheep Wool",baseline:0.17,target:0.14},
    {name:"Hemp Fibre",baseline:0.22,target:0.18},
    {name:"Perlite (Expanded)",baseline:0.98,target:0.78},
    {name:"Vermiculite (Expanded)",baseline:0.88,target:0.70}]},
  // ── PLASTICS & POLYMERS ──
  Plastics:{unit:"kg",massFactor:1,efUnit:"kgCO\u2082e/kg",group:"Plastics & Polymers",types:[
    {name:"PVC (General Rigid)",baseline:3.22,target:2.58},
    {name:"PVC Pipe (uPVC)",baseline:3.10,target:2.48},
    {name:"PVC Flooring (Vinyl)",baseline:3.19,target:2.55},
    {name:"PVC Window Profile",baseline:3.35,target:2.68},
    {name:"HDPE (High Density Polyethylene)",baseline:1.93,target:1.54},
    {name:"HDPE Pipe",baseline:2.00,target:1.60},
    {name:"LDPE (Low Density Polyethylene)",baseline:2.08,target:1.66},
    {name:"PP (Polypropylene)",baseline:1.98,target:1.58},
    {name:"Polycarbonate",baseline:7.40,target:5.92},
    {name:"Nylon (Polyamide 6)",baseline:6.70,target:5.36},
    {name:"ABS",baseline:3.55,target:2.84},
    {name:"Polystyrene (General)",baseline:3.43,target:2.74},
    {name:"GRP / Fibreglass (Glass Reinforced Polymer)",baseline:8.10,target:6.48},
    {name:"EPDM Rubber",baseline:2.85,target:2.28},
    {name:"Silicone Sealant",baseline:4.60,target:3.68},
    {name:"Epoxy Resin",baseline:5.90,target:4.72},
    {name:"Polyester Resin",baseline:4.50,target:3.60}]},
  // ── FINISHES ──
  "Paints & Coatings":{unit:"kg",massFactor:1,efUnit:"kgCO\u2082e/kg",group:"Finishes",types:[
    {name:"Water-Based Paint (Emulsion)",baseline:1.16,target:0.93},
    {name:"Solvent-Based Paint (Gloss)",baseline:2.42,target:1.94},
    {name:"Primer (General)",baseline:1.50,target:1.20},
    {name:"Varnish / Lacquer",baseline:2.10,target:1.68},
    {name:"Intumescent Paint (Fire Protection)",baseline:3.20,target:2.56},
    {name:"Anti-Corrosion Coating",baseline:2.80,target:2.24},
    {name:"Powder Coating",baseline:3.40,target:2.72}]},
  Plaster:{unit:"kg",massFactor:1,efUnit:"kgCO\u2082e/kg",group:"Finishes",types:[
    {name:"Plaster (General Gypsum)",baseline:0.12,target:0.10},
    {name:"Plasterboard (Standard)",baseline:0.39,target:0.31},
    {name:"Plasterboard (Moisture Resistant)",baseline:0.42,target:0.34},
    {name:"Plasterboard (Fire Rated)",baseline:0.45,target:0.36},
    {name:"Cement Render",baseline:0.22,target:0.18},
    {name:"Lime Plaster",baseline:0.12,target:0.10},
    {name:"Acoustic Plaster",baseline:0.50,target:0.40}]},
  "Floor Coverings":{unit:"kg",massFactor:1,efUnit:"kgCO\u2082e/kg",group:"Finishes",types:[
    {name:"Carpet (Synthetic, Tufted)",baseline:5.53,target:4.42},
    {name:"Carpet (Wool)",baseline:5.02,target:4.02},
    {name:"Carpet Tile (Nylon)",baseline:5.00,target:4.00},
    {name:"Linoleum",baseline:1.21,target:0.97},
    {name:"Rubber Flooring",baseline:2.85,target:2.28},
    {name:"Terrazzo",baseline:0.35,target:0.28},
    {name:"Vinyl / PVC Flooring",baseline:3.19,target:2.55},
    {name:"Epoxy Flooring",baseline:5.50,target:4.40},
    {name:"Natural Stone Flooring",baseline:0.12,target:0.10}]},
  // ── WATERPROOFING ──
  Waterproofing:{unit:"kg",massFactor:1,efUnit:"kgCO\u2082e/kg",group:"Envelope",types:[
    {name:"Bitumen Sheet Membrane",baseline:0.48,target:0.38},
    {name:"Modified Bitumen (APP/SBS)",baseline:0.52,target:0.42},
    {name:"EPDM Membrane",baseline:2.85,target:2.28},
    {name:"PVC Membrane (Single Ply)",baseline:3.22,target:2.58},
    {name:"TPO Membrane",baseline:3.00,target:2.40},
    {name:"Liquid Applied Membrane",baseline:3.50,target:2.80},
    {name:"Cementitious Waterproofing",baseline:0.60,target:0.48},
    {name:"Bentonite Mat",baseline:0.35,target:0.28}]},
  // ── ASPHALT & ROADS ──
  Asphalt:{unit:"tons",massFactor:1000,efUnit:"kgCO\u2082e/ton",group:"Infrastructure",types:[
    {name:"3% Binder",baseline:50.1,target:40.08},{name:"3.5% Binder",baseline:51.1,target:40.88},{name:"4% Binder",baseline:52.2,target:41.76},
    {name:"4.5% Binder",baseline:53.2,target:42.56},{name:"5% Binder",baseline:54.2,target:43.36},{name:"5.5% Binder",baseline:55.3,target:44.24},
    {name:"6% Binder",baseline:56.3,target:45.04},{name:"6.5% Binder",baseline:57.3,target:45.84},{name:"7% Binder",baseline:58.4,target:46.72},
    {name:"Warm Mix Asphalt (WMA)",baseline:44.0,target:35.20},
    {name:"Reclaimed Asphalt (RAP 30%)",baseline:38.0,target:30.40}]},
  Pipes:{unit:"m",massFactor:1,efUnit:"kgCO\u2082e/m",group:"Infrastructure",types:[
    {name:"Precast Concrete 300mm",baseline:72.50,target:72.50},
    {name:"Precast Concrete 450mm",baseline:105.40,target:105.40},
    {name:"Precast Concrete 600mm",baseline:138.89,target:138.89},
    {name:"Precast Concrete 800mm",baseline:241.29,target:241.29},
    {name:"Precast Concrete 1000mm",baseline:394.70,target:394.70},
    {name:"Precast Concrete 1200mm",baseline:543.80,target:543.80},
    {name:"Precast Concrete 1500mm",baseline:720.00,target:720.00},
    {name:"Ductile Iron 100mm",baseline:18.50,target:14.80},
    {name:"Ductile Iron 200mm",baseline:35.00,target:28.00},
    {name:"Ductile Iron 300mm",baseline:55.00,target:44.00},
    {name:"HDPE Pipe 110mm",baseline:4.20,target:3.36},
    {name:"HDPE Pipe 250mm",baseline:14.50,target:11.60},
    {name:"HDPE Pipe 400mm",baseline:32.00,target:25.60},
    {name:"PVC-U Pipe 110mm",baseline:3.80,target:3.04},
    {name:"PVC-U Pipe 160mm",baseline:7.50,target:6.00},
    {name:"GRP Pipe 300mm",baseline:20.00,target:16.00},
    {name:"GRP Pipe 600mm",baseline:48.00,target:38.40},
    {name:"Steel Pipe (Welded) 200mm",baseline:24.00,target:19.20},
    {name:"Steel Pipe (Welded) 400mm",baseline:52.00,target:41.60}]},
  Earthwork:{unit:"tons",massFactor:1000,efUnit:"kgCO\u2082e/ton",group:"Infrastructure",types:[
    {name:"Excavation/Hauling",baseline:3.50,target:2.80},
    {name:"Coarse Aggregate (Crushed Rock)",baseline:5.20,target:4.16},
    {name:"Fine Aggregate (Sand)",baseline:4.80,target:3.84},
    {name:"Gravel (General)",baseline:4.00,target:3.20},
    {name:"Sub-base Type 1",baseline:4.40,target:3.52},
    {name:"Recycled Aggregate",baseline:2.00,target:1.60},
    {name:"Geotextile (PP)",baseline:2.85,target:2.28},
    {name:"Fill Material (Imported)",baseline:3.80,target:3.04},
    {name:"Gabion Baskets (Steel)",baseline:2.80,target:2.24}]},
  // ── MEP — coveragePct < 80 = complex assemblies, A1-A3 = ZERO ──
  "MEP - HVAC":{unit:"kg",massFactor:1,efUnit:"kgCO\u2082e/kg",group:"MEP",isMEP:true,types:[
    {name:"Galvanized Steel Ductwork",baseline:2.74,target:2.07,coveragePct:90},
    {name:"Aluminum Ductwork",baseline:8.24,target:6.59,coveragePct:85},
    {name:"Duct Insulation (Mineral Wool)",baseline:1.12,target:0.90,coveragePct:88},
    {name:"Duct Insulation (Rubber/Elastomeric)",baseline:2.85,target:2.28,coveragePct:82},
    {name:"Copper Refrigerant Piping",baseline:3.01,target:2.41,coveragePct:90},
    {name:"Steel Piping (Black/ERW)",baseline:2.36,target:1.77,coveragePct:90},
    {name:"Pipe Insulation (Mineral Wool)",baseline:1.12,target:0.90,coveragePct:88},
    {name:"Pipe Insulation (PIR/PUR)",baseline:4.20,target:3.36,coveragePct:82},
    {name:"AHU (Air Handling Unit)",baseline:0,target:0,coveragePct:45},
    {name:"Chiller (Water-Cooled)",baseline:0,target:0,coveragePct:35},
    {name:"Chiller (Air-Cooled)",baseline:0,target:0,coveragePct:35},
    {name:"Cooling Tower",baseline:0,target:0,coveragePct:40},
    {name:"Boiler (Gas-Fired)",baseline:0,target:0,coveragePct:38},
    {name:"Heat Pump (Air Source)",baseline:0,target:0,coveragePct:32},
    {name:"Heat Pump (Ground Source)",baseline:0,target:0,coveragePct:30},
    {name:"FCU (Fan Coil Unit)",baseline:0,target:0,coveragePct:42},
    {name:"VAV Box",baseline:0,target:0,coveragePct:48},
    {name:"Split AC Unit",baseline:0,target:0,coveragePct:38},
    {name:"VRF/VRV System (Outdoor Unit)",baseline:0,target:0,coveragePct:30},
    {name:"Pumps (HVAC Circulation)",baseline:0,target:0,coveragePct:55},
    {name:"Fans (Centrifugal/Axial)",baseline:0,target:0,coveragePct:52},
    {name:"BMS / Controls (Package)",baseline:0,target:0,coveragePct:20}]},
  "MEP - Electrical":{unit:"kg",massFactor:1,efUnit:"kgCO\u2082e/kg",group:"MEP",isMEP:true,types:[
    {name:"Copper Cable (PVC Insulated)",baseline:3.20,target:2.56,coveragePct:85},
    {name:"Aluminum Cable (XLPE)",baseline:8.24,target:6.59,coveragePct:83},
    {name:"Cable Tray (Galvanized Steel)",baseline:2.74,target:2.07,coveragePct:90},
    {name:"Cable Tray (Aluminum)",baseline:8.24,target:6.59,coveragePct:88},
    {name:"Conduit (Steel, GI)",baseline:2.74,target:2.07,coveragePct:92},
    {name:"Conduit (PVC)",baseline:3.10,target:2.48,coveragePct:90},
    {name:"Busbar Trunking (Copper)",baseline:3.50,target:2.80,coveragePct:80},
    {name:"Busbar Trunking (Aluminum)",baseline:8.50,target:6.80,coveragePct:80},
    {name:"Transformer (Dry Type)",baseline:0,target:0,coveragePct:40},
    {name:"Transformer (Oil-Immersed)",baseline:0,target:0,coveragePct:38},
    {name:"Switchgear (MV)",baseline:0,target:0,coveragePct:35},
    {name:"Switchgear (LV Panelboard)",baseline:0,target:0,coveragePct:42},
    {name:"Distribution Board",baseline:0,target:0,coveragePct:45},
    {name:"UPS System",baseline:0,target:0,coveragePct:25},
    {name:"Generator (Diesel Standby)",baseline:0,target:0,coveragePct:28},
    {name:"LED Luminaire (General)",baseline:0,target:0,coveragePct:55},
    {name:"LED High Bay",baseline:0,target:0,coveragePct:50},
    {name:"Street / Pole Light",baseline:0,target:0,coveragePct:48},
    {name:"Solar PV Panel",baseline:0,target:0,coveragePct:70},
    {name:"Battery Storage (Li-ion)",baseline:0,target:0,coveragePct:45},
    {name:"Fire Alarm System (Package)",baseline:0,target:0,coveragePct:22},
    {name:"ELV Systems (CCTV/Access)",baseline:0,target:0,coveragePct:18}]},
  "MEP - Plumbing":{unit:"kg",massFactor:1,efUnit:"kgCO\u2082e/kg",group:"MEP",isMEP:true,types:[
    {name:"Copper Pipe (15-54mm)",baseline:3.01,target:2.41,coveragePct:90},
    {name:"PPR Pipe (PN10/16/20)",baseline:1.98,target:1.58,coveragePct:88},
    {name:"CPVC Pipe",baseline:3.15,target:2.52,coveragePct:86},
    {name:"PEX Pipe",baseline:2.20,target:1.76,coveragePct:85},
    {name:"HDPE Pipe (Drainage)",baseline:2.00,target:1.60,coveragePct:88},
    {name:"Cast Iron Pipe (Drainage)",baseline:1.91,target:1.53,coveragePct:90},
    {name:"PVC-U Pipe (Drainage)",baseline:3.10,target:2.48,coveragePct:90},
    {name:"Stainless Steel Pipe",baseline:6.15,target:4.92,coveragePct:88},
    {name:"GRP Pipe (Water/Sewer)",baseline:8.10,target:6.48,coveragePct:82},
    {name:"Pipe Fittings (Mixed Metals)",baseline:0,target:0,coveragePct:60},
    {name:"Valves (Gate/Ball/Butterfly)",baseline:0,target:0,coveragePct:55},
    {name:"Water Heater (Electric/Gas)",baseline:0,target:0,coveragePct:38},
    {name:"Calorifier / Storage Tank",baseline:0,target:0,coveragePct:42},
    {name:"Pumps (Domestic Water/Booster)",baseline:0,target:0,coveragePct:50},
    {name:"Water Tank (GRP)",baseline:8.10,target:6.48,coveragePct:80},
    {name:"Water Tank (Steel Sectional)",baseline:2.50,target:1.87,coveragePct:82},
    {name:"Sanitary Fixtures (Ceramic WC)",baseline:1.61,target:1.29,coveragePct:80},
    {name:"Sanitary Fixtures (Steel Bath)",baseline:2.50,target:1.87,coveragePct:80}]},
  "MEP - Fire Protection":{unit:"kg",massFactor:1,efUnit:"kgCO\u2082e/kg",group:"MEP",isMEP:true,types:[
    {name:"Steel Sprinkler Pipe (Black/Galv)",baseline:2.50,target:1.87,coveragePct:90},
    {name:"CPVC Sprinkler Pipe",baseline:3.15,target:2.52,coveragePct:86},
    {name:"Sprinkler Heads",baseline:0,target:0,coveragePct:55},
    {name:"Fire Pump Set",baseline:0,target:0,coveragePct:35},
    {name:"Fire Hydrant System (Package)",baseline:0,target:0,coveragePct:40},
    {name:"FM200 / Gas Suppression System",baseline:0,target:0,coveragePct:25},
    {name:"Fire Dampers (Steel)",baseline:2.74,target:2.07,coveragePct:85},
    {name:"Smoke Dampers (Steel)",baseline:2.74,target:2.07,coveragePct:82},
    {name:"Fire Rated Ductwork",baseline:2.74,target:2.07,coveragePct:80},
    {name:"Intumescent Fire Wrap",baseline:3.20,target:2.56,coveragePct:80}]},
};

// ===== TENDER GWP LOOKUP — A1-A3 MATERIALS FIRST, THEN ICE FALLBACK =====
// Priority: Use consultant-defined A1-A3 baseline factors from MATERIALS.
// Only if a material is NOT found in MATERIALS, fallback to ICE database.
// Tender quantities use BASELINE ONLY — no target values.
function lookupTenderGWP(desc, catHint, unitHint) {
  var d = desc.toLowerCase();
  // Step 1: Try matching to A1-A3 MATERIALS (consultant-defined baseline factors)
  var a13Match = matchToA13Materials(d, catHint);
  if (a13Match.matched) return a13Match;
  // Step 2: Fallback to ICE database
  var iceMatch = matchToICE(desc, catHint, unitHint);
  if (iceMatch.matched) {
    iceMatch.gwpSource = 'ICE';
    // In tender mode, use only baseline — set target = baseline
    iceMatch.target = iceMatch.baseline;
    return iceMatch;
  }
  return { matched: false, score: 0, gwpSource: 'none' };
}

// Match description against A1-A3 MATERIALS (consultant-defined factors)
function matchToA13Materials(desc, catHint) {
  var d = desc.toLowerCase();
  var bestScore = 0, bestCat = '', bestType = '', bestIdx = -1, bestMat = null, bestTypeObj = null;

  Object.keys(MATERIALS).forEach(function(cat) {
    var m = MATERIALS[cat];
    var catL = cat.toLowerCase();
    var catBonus = 0;
    if (catHint && catHint.toLowerCase().indexOf(catL) !== -1) catBonus = 30;
    if (d.indexOf(catL) !== -1) catBonus += 15;

    m.types.forEach(function(t, idx) {
      var score = catBonus;
      var words = t.name.toLowerCase().split(/[\s\/\-\(\)]+/).filter(function(w) { return w.length > 2; });
      words.forEach(function(w) { if (d.indexOf(w) !== -1) score += 12; });

      // Concrete grade matching
      var gradeMatch = d.match(/c(\d{2,3})/i);
      if (gradeMatch && t.name.toLowerCase().indexOf('c' + gradeMatch[1]) !== -1) score += 40;

      // Pipe size matching
      var pipeMatch = d.match(/(\d{3,4})\s*mm/);
      if (pipeMatch && t.name.indexOf(pipeMatch[1] + 'mm') !== -1) score += 35;

      if (score > bestScore) {
        bestScore = score;
        bestCat = cat;
        bestType = t.name;
        bestIdx = idx;
        bestMat = m;
        bestTypeObj = t;
      }
    });
  });

  if (bestScore < 10) return { matched: false, score: 0, gwpSource: 'none' };

  // Build alternatives from same A1-A3 category for dropdown selection
  var alternatives = [];
  bestMat.types.forEach(function(t, idx) {
    alternatives.push({ name: t.name, baseline: t.baseline, target: t.target, idx: idx });
  });

  return {
    matched: true,
    score: bestScore,
    category: bestCat,
    typeName: bestType,
    typeIdx: bestIdx,
    baseline: bestTypeObj.baseline,
    target: bestTypeObj.baseline, // Tender = baseline only, no target
    isMEP: false,
    belowThreshold: false,
    coveragePct: 100,
    mat: bestMat,
    gwpSource: 'A1-A3', // From consultant-defined MATERIALS
    alternatives: alternatives,
    assumption: 'Auto-matched to A1-A3: "' + bestCat + '" \u2192 "' + bestType + '"'
  };
}

// ===== ICE HELPERS (for Tender BOQ only — never touch MATERIALS) =====
function getICEGroups() {
  var groups = {};
  Object.keys(ICE_MATERIALS).forEach(function(cat) {
    var g = ICE_MATERIALS[cat].group || 'Other';
    if (!groups[g]) groups[g] = [];
    groups[g].push(cat);
  });
  return groups;
}

function isICEMEPBelowThreshold(category, typeName) {
  var mat = ICE_MATERIALS[category];
  if (!mat || !mat.isMEP) return false;
  var t = mat.types.find(function(x) { return x.name === typeName; });
  if (!t) return false;
  return (t.coveragePct || 100) < ICE_COVERAGE_THRESHOLD;
}

// Fuzzy column finder for BOQ uploads
function findColumn(headers, keywords) {
  for (var k = 0; k < keywords.length; k++) {
    for (var h = 0; h < headers.length; h++) {
      if (headers[h] === keywords[k]) return h;
    }
  }
  for (var k2 = 0; k2 < keywords.length; k2++) {
    for (var h2 = 0; h2 < headers.length; h2++) {
      if (headers[h2].indexOf(keywords[k2]) !== -1) return h2;
    }
  }
  return -1;
}

function buildColSelect(id, label, headers, autoIdx) {
  var opts = '<option value="-1">\u2014 Not mapped \u2014</option>';
  for (var i = 0; i < headers.length; i++) {
    opts += '<option value="' + i + '"' + (i === autoIdx ? ' selected' : '') + '>' + (headers[i] || 'Col ' + (i+1)) + '</option>';
  }
  return '<div class="fg"><label>' + label + '</label><select id="' + id + '">' + opts + '</select></div>';
}

// Match a BOQ description to ICE database
function matchToICE(desc, catHint, unitHint) {
  var d = desc.toLowerCase();
  var bestScore = 0, bestCat = '', bestType = '', bestIdx = -1, bestMat = null;

  Object.keys(ICE_MATERIALS).forEach(function(cat) {
    var m = ICE_MATERIALS[cat];
    var catL = cat.toLowerCase();
    var catBonus = 0;
    if (catHint && catHint.toLowerCase().indexOf(catL) !== -1) catBonus = 30;
    if (d.indexOf(catL) !== -1) catBonus += 15;

    m.types.forEach(function(t, idx) {
      var score = catBonus;
      var words = t.name.toLowerCase().split(/[\s\/\-\(\)]+/).filter(function(w) { return w.length > 2; });
      words.forEach(function(w) { if (d.indexOf(w) !== -1) score += 12; });

      // Concrete grade matching
      var gradeMatch = d.match(/c(\d{2,3})/i);
      if (gradeMatch && t.name.toLowerCase().indexOf('c' + gradeMatch[1]) !== -1) score += 40;

      // Pipe size matching
      var pipeMatch = d.match(/(\d{3,4})\s*mm/);
      if (pipeMatch && t.name.indexOf(pipeMatch[1] + 'mm') !== -1) score += 35;

      // MEP keywords
      if (m.isMEP) {
        var mepKw = ['ahu','chiller','transformer','switchgear','cable','duct','sprinkler','pump','fan','boiler','heat pump','vrf','vrv','fcu','vav','conduit','busbar','led','solar','generator','ups'];
        mepKw.forEach(function(kw) { if (d.indexOf(kw) !== -1 && t.name.toLowerCase().indexOf(kw) !== -1) score += 25; });
      }

      if (score > bestScore) {
        bestScore = score;
        bestCat = cat;
        bestType = t.name;
        bestIdx = idx;
        bestMat = m;
      }
    });
  });

  if (bestScore < 10) return { matched: false, score: 0 };

  var t = bestMat.types[bestIdx];
  var belowThreshold = bestMat.isMEP && t.coveragePct !== undefined && t.coveragePct < ICE_COVERAGE_THRESHOLD;

  // Build alternatives from same ICE category for dropdown selection
  var alternatives = [];
  bestMat.types.forEach(function(tp, idx) {
    var altBelow = bestMat.isMEP && tp.coveragePct !== undefined && tp.coveragePct < ICE_COVERAGE_THRESHOLD;
    alternatives.push({ name: tp.name, baseline: altBelow ? 0 : tp.baseline, target: altBelow ? 0 : tp.target, idx: idx });
  });

  return {
    matched: true,
    score: bestScore,
    category: bestCat,
    typeName: bestType,
    typeIdx: bestIdx,
    baseline: belowThreshold ? 0 : t.baseline,
    target: belowThreshold ? 0 : t.target,
    isMEP: !!bestMat.isMEP,
    belowThreshold: belowThreshold,
    coveragePct: t.coveragePct || 100,
    mat: bestMat,
    alternatives: alternatives,
    assumption: 'Auto-matched to ICE: "' + bestCat + '" \u2192 "' + bestType + '"' + (belowThreshold ? ' [MEP <80% coverage \u2192 EF=0]' : ''),
    iceRefUrl: 'https://circularecology.com/embodied-carbon-footprint-database.html'
  };
}

// CSV parser for BOQ uploads
function parseCSV(text) {
  var rows = [], row = [], cell = '', inQuote = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (inQuote) {
      if (ch === '"' && text[i+1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuote = false;
      else cell += ch;
    } else {
      if (ch === '"') inQuote = true;
      else if (ch === ',') { row.push(cell.trim()); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i+1] === '\n') i++;
        row.push(cell.trim()); if (row.some(function(c) { return c !== ''; })) rows.push(row);
        row = []; cell = '';
      } else cell += ch;
    }
  }
  row.push(cell.trim()); if (row.some(function(c) { return c !== ''; })) rows.push(row);
  return rows;
}

// Download BOQ template CSV
function downloadBOQTemplate() {
  var csv = '\ufeffDescription,Quantity,Unit,Category,Notes\n';
  csv += 'C30-40 Concrete for Foundations,450,m\u00b3,Concrete,Grade C30/40\n';
  csv += 'Rebar B500B,85000,kg,Steel,High yield\n';
  csv += 'Asphalt 5% Binder,1200,tons,Asphalt,Road works\n';
  csv += 'Galvanized Steel Ductwork,2500,kg,MEP - HVAC,Main risers\n';
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'BOQ_Template.csv';
  a.click();
}

function downloadBOQTemplateFull() {
  var csv = '\ufeffCategory,Type,Unit,EF Unit,Baseline EF,Target EF\n';
  Object.keys(ICE_MATERIALS).forEach(function(cat) {
    var m = ICE_MATERIALS[cat];
    m.types.forEach(function(t) {
      var bl = (m.isMEP && t.coveragePct !== undefined && t.coveragePct < ICE_COVERAGE_THRESHOLD) ? 0 : t.baseline;
      var tg = (m.isMEP && t.coveragePct !== undefined && t.coveragePct < ICE_COVERAGE_THRESHOLD) ? 0 : t.target;
      csv += '"' + cat + '","' + t.name + '",' + m.unit + ',' + m.efUnit + ',' + bl + ',' + tg + '\n';
    });
  });
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ICE_Database_v3_Full.csv';
  a.click();
}
