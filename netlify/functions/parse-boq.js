// ===== ECCS — Enhanced BOQ Carbon Classification Engine =====
// AI-powered BOQ parsing with enterprise-grade classification hierarchy
// Version 3.0 — Supports chunked processing for large documents (parts 1-12+)
const { getDb, verifyToken, headers, respond, optionsResponse, csrfCheck } = require('./utils/firebase');
const { getClientId, checkRateLimit } = require('./lib/rate-limit');

// ============================================================
// ECCS CLASSIFICATION HIERARCHY (6-Step Decision Tree)
// ============================================================
// For EVERY BOQ item, apply these checks IN ORDER. Stop at first match:
// STEP 1 → Demolition/Removal   → carbon_factor = 0
// STEP 2 → Complex MEP Assembly → carbon_factor = 0
// STEP 3 → Provisional/Lump Sum → carbon_factor = 0
// STEP 4 → Labour/Service       → carbon_factor = 0
// STEP 5 → Landscaping/Organic  → carbon_factor = 0
// STEP 6 → Quantifiable Material → classify and assign EF
// ============================================================

// Build the AI prompt for a given text chunk
function buildPrompt(text, fileName, chunkInfo) {
  const chunkNote = chunkInfo
    ? `\n\nNOTE: This is chunk ${chunkInfo.current} of ${chunkInfo.total} from a large document. Parse ALL items in this chunk.`
    : '';

  return `You are an expert Embodied Carbon Engineer classifying Bill of Quantities (BOQ) items for carbon assessment. Your role is to analyze each BOQ line item and assign the correct material classification, carbon factor, lifecycle stage, and unit conversion.
${chunkNote}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULE 0: CLASSIFICATION HIERARCHY — FOLLOW THIS ORDER STRICTLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For EVERY BOQ item, apply these checks IN ORDER. Stop at the first match:

STEP 1 → Is it a DEMOLITION or REMOVAL item?
  Keywords: "remove", "demolish", "strip out", "break up", "dismantle", "pull down",
            "take down", "rip out", "clear away", "disposal", "break out"
  ACTION → Set baselineEF = 0, lifecycleStage = "A5", isDemolition = true,
           category = "Demolition/Removal", gwpSource = "none",
           assumption = "ZERO — Demolition/removal activity, no A1-A3 embodied carbon"
  Even if material is mentioned (e.g., "Remove steel plate"), A1-A3 = 0.

STEP 2 → Is it a COMPLEX MEP ASSEMBLY?
  A Complex MEP item is any manufactured assembly containing MULTIPLE materials
  (metals, plastics, electronics, wiring, glass) that CANNOT be decomposed into
  a single dominant material from a BOQ description alone.

  ALWAYS classify as Complex MEP (baselineEF = 0) if description contains:

  ELECTRICAL:
  - Light fittings/luminaires/lamps (ANY type: inset, surface, pendant, recessed,
    directional, omni-directional, bi-directional, uni-directional, emergency, LED,
    flood, spot, down-light, strip, decorative, bollard, pole-mounted)
  - "complete with transformer" / "complete with driver" / "complete with ballast"
  - "secondary connector" / "and all accessories" with electrical items
  - Switchgear, distribution boards, panel boards, MCBs, RCDs, isolators
  - Transformers, UPS systems, generators, inverters
  - Fire alarm devices, smoke detectors, heat detectors, sounders
  - CCTV cameras, access control units, card readers, intercoms
  - Public address speakers, AV equipment, display screens
  - BMS controllers, sensors, actuators, DDC panels
  - Socket outlets with USB, data outlets, floor boxes (as assemblies)

  MECHANICAL / HVAC:
  - Fan coil units, AHUs, package units, split AC, cassette units, VRF/VRV
  - Chillers, cooling towers, boilers, heat exchangers
  - VAV boxes, diffusers with dampers, grilles with opposed blade dampers
  - Pumps (all types), expansion vessels, buffer tanks, calorifiers
  - Kitchen extract hoods, fume cupboards, heat recovery units

  PLUMBING / FIRE:
  - Sanitary ware (WCs, basins, urinals, sinks, showers — ceramic+metal+plastic)
  - Water heaters, solar thermal panels
  - Fire sprinkler heads, deluge systems, foam systems, fire hydrants, hose reels
  - Backflow preventers, pressure reducing valves (as assemblies)

  LIFTS & SPECIALIST:
  - Elevators/lifts, escalators, moving walkways, dumbwaiters
  - Automated doors, revolving doors, security barriers, boom gates
  - Baggage handling systems, conveyor systems, PV solar panels, EV charging

  KEY INDICATORS: "complete with", "including all accessories", "with transformer",
    "with driver", "secondary connector", "low voltage system", unit = "nr"/"set" + MEP

  ACTION → Set baselineEF = 0, category = "Complex MEP", gwpSource = "none",
           confidence = "high", assumption = "ZERO — Complex MEP assembly, requires manufacturer EPD"

  DO NOT classify simple MEP MATERIALS as Complex MEP:
  - Plain copper pipe (by meter) → Copper
  - Plain steel conduit (by meter) → Steel
  - PVC/HDPE pipe (by meter) → Plastics
  - Cable (by meter, single type) → estimate by copper/aluminum content
  - Ductwork (by kg or m²) → galvanized steel or aluminum
  The test: if you can identify a SINGLE DOMINANT material AND the BOQ gives weight or
  dimension → classify it. If it's a manufactured ASSEMBLY of multiple materials → 0.

STEP 3 → Is it PROVISIONAL/LUMP SUM/PRELIMINARIES?
  Keywords: "provisional sum", "lump sum", "preliminaries", "general requirements",
            "daywork", "contingency", "insurance", "bonds", "testing allowance"
  ACTION → Set baselineEF = 0, category = "Non-material", gwpSource = "none"

STEP 4 → Is it LABOUR-ONLY or SERVICE?
  Keywords: "labour", "labor", "workmanship", "installation only", "commission",
            "testing", "inspection", "survey", "design fee", "attendance"
  ACTION → Set baselineEF = 0, category = "Service/Labour", gwpSource = "none"

STEP 5 → Is it LANDSCAPING/ORGANIC?
  Keywords: "topsoil", "planting", "tree", "shrub", "grass", "turf", "mulch",
            "fertilizer", "seeds" (note: irrigation PIPES are separate materials)
  ACTION → Set baselineEF = 0, category = "Landscaping", gwpSource = "none"

STEP 6 → QUANTIFIABLE CONSTRUCTION MATERIAL
  Only if Steps 1-5 did NOT match → proceed to material classification below.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MATERIAL MATCHING (Step 6 items ONLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### A1-A3 CATEGORIES (Priority 1) — Consultant-defined baseline EFs:

Concrete [unit: m³, efUnit: kgCO₂e/m³]:
  C15-20 (323), C20-30 (354), C30-40 (431), C40-50 (430), C50-60 (483), C60-70 (522)
  Grade matching: F5.2→C30-40, F10→C40-50, F3.5→C20-30
  "lean mix"/"blinding" → C15-20, "structural"/"foundation" → C30-40, "high strength" → C40-50+

Steel [unit: kg, efUnit: kgCO₂e/kg]:
  Structural I-sections (2.46), Rebar (2.26), Hollow sections (2.52), Hot Dip Galvanized (2.74)

Asphalt [unit: tons, efUnit: kgCO₂e/ton]:
  3% Binder (50.1), 4% (52.2), 5% (54.2), 6% (56.3), 7% (58.4)
  PMB/polymer modified → use 5% minimum

Aluminum [unit: kg, efUnit: kgCO₂e/kg]:
  Profile Without Coating (10.8), With Coating (10.8), Sheets (13.5)
  WARNING: "Aluminum" in light fittings ≠ Aluminum material. Check Step 2 first!

Glass [unit: kg, efUnit: kgCO₂e/kg]:
  Annealed (1.28), Coated (1.61), Laminated (1.77), IGU (4.12)

Earth_Work [unit: tkm, efUnit: kgCO₂/tkm]:
  Excavation/Hauling (0.11), Demolition Removal (0.11)

Subgrade [unit: kg, efUnit: kgCO₂e/kg]:
  Coarse & Fine Aggregate Recycled (0.0006), Coarse Aggregate (0.0103), Sand (0.0052)

Pipes [unit: m, efUnit: kgCO₂e/m]:
  600mm (179.9), 700mm (241.3), 800mm (307.2), 900mm (394.7), 1000mm (436.2),
  1200mm (543.8), 1500mm (814.1), 1800mm (1138.3)

### ICE DATABASE (Priority 2 — only if no A1-A3 match):
Concrete: C8-10 to C70-85, Precast, Lightweight, Fibre Reinforced, Blocks
Steel: I/H Sections, Rebar, Tubes, Galvanized, Coil, Plate, Stainless, Mesh, Piles
Timber: Softwood (0.31/kg), Hardwood (0.39/kg), Glulam (0.51/kg), CLT (0.44/kg), Plywood (0.68/kg)
Masonry: Brick (0.24/kg), Mortar (0.163/kg), Natural Stone (0.079/kg)
Ceramics: Ceramic tile (0.59/kg), Porcelain (0.70/kg)
Cement: CEM I (0.91/kg), CEM II (0.63-0.76/kg), GGBS (0.07/kg), Lime (0.76/kg)
Insulation: EPS (3.29/kg), XPS (3.45/kg), PIR (4.26/kg), Mineral Wool (1.28/kg)
Plastics: PVC (3.10/kg), HDPE (1.93/kg), PP (3.43/kg)
Waterproofing: Bituminous membrane (0.45/kg), EPDM (3.65/kg)
Paints: Water-based (2.42/kg), Primer, Intumescent
Plaster: Gypsum, Plasterboard (0.39/kg), Render
Copper: General (3.81/kg), Pipe (3.81/kg)
Earthwork: Excavation (3.50/ton), Aggregates (5.20/ton), Sand (4.80/ton)
Pipes: Ductile Iron, HDPE, PVC-U, GRP, Steel (various diameters)
MEP - HVAC: Ductwork, AHU, Chiller (simple materials by kg/m only)
MEP - Electrical: Cable, Cable Tray (simple materials by kg/m only)
MEP - Plumbing: Copper/PPR/CPVC/PEX pipe (simple materials by m only)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UNIT & DIMENSION PARSING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Extract thickness/depth from description → set thicknessMM (in mm)
- m² + thickness → system will auto-convert to m³
- kg/tonnes → direct
- "nr" for material items → estimate mass from dimensions if possible
- "nr" for MEP assemblies → DO NOT estimate mass, carbon = 0
- Do NOT confuse rebar diameter or pipe diameter with layer thickness
- Standard densities: concrete=2400, steel=7850, aluminum=2700, asphalt=2350

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FEW-SHOT EXAMPLES (Learn from these)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ITEM: "Remove existing blanking plate" | 1,384 nr
CORRECT: { "category": "Demolition/Removal", "baselineEF": 0, "lifecycleStage": "A5", "isDemolition": true, "gwpSource": "none", "confidence": "high" }
WRONG: { "category": "Steel", "baselineEF": 2.44 } ← WRONG: this is removal, not new material

ITEM: "Bi-Directional Inset light fitting, complete with transformer, secondary connector and all accessories" | 523 nr
CORRECT: { "category": "Complex MEP", "baselineEF": 0, "gwpSource": "none", "confidence": "high", "assumption": "ZERO — Complex MEP assembly (light fitting with transformer, connector, accessories), requires manufacturer EPD" }
WRONG: { "category": "Aluminum", "baselineEF": 10.80 } ← WRONG: multi-material assembly, not pure aluminum

ITEM: "150mm thick C40 concrete slab" | 2,500 m²
CORRECT: { "category": "Concrete", "type": "C40-50", "baselineEF": 430, "efUnit": "kgCO₂e/m³", "thicknessMM": 150, "unit": "m²", "materialUnit": "m³", "gwpSource": "A1-A3", "confidence": "high" }

ITEM: "Steel reinforcement bar, high yield, B500B" | 450,000 kg
CORRECT: { "category": "Steel", "type": "Rebar", "baselineEF": 2.26, "efUnit": "kgCO₂e/kg", "unit": "kg", "gwpSource": "A1-A3", "confidence": "high" }

ITEM: "Provisional sum for testing" | 1 sum
CORRECT: { "category": "Non-material", "baselineEF": 0, "gwpSource": "none", "confidence": "high" }

ITEM: "25mm diameter copper pipe to BS EN 1057" | 1,200 m
CORRECT: { "category": "Copper", "baselineEF": 3.81, "efUnit": "kgCO₂e/kg", "gwpSource": "ICE", "confidence": "high" }
WRONG: { "category": "Complex MEP", "baselineEF": 0 } ← WRONG: plain pipe by the meter IS a simple material

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL WARNINGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- NEVER assume material from one word. "Aluminum" in light fittings = Complex MEP = 0
- NEVER assign A1-A3 carbon to demolition/removal items
- NEVER guess mass for MEP items counted in "nr". If assembly → 0
- ALWAYS check unit against description context
- ALWAYS flag uncertainty: confidence "low" + review reason if < 80% confident
- "complete with" → almost always indicates an assembly → Step 2 → 0
- Process EVERY item. Never skip. 100% coverage.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Return ONLY a valid JSON array. Each element:
{
  "itemNo": "exact BOQ number",
  "description": "FULL work description (NOT item number). 10+ characters.",
  "qty": number,
  "unit": "clean abbreviation (m², m³, kg, tonnes, nr, m, lin.m)",
  "thicknessMM": number or null,
  "lifecycleStage": "A1-A3" or "A4" or "A5" or "D",
  "isDemolition": true/false,
  "isComplexMEP": true/false,
  "category": "from lists above or Demolition/Removal or Complex MEP or Non-material or Service/Labour or Landscaping",
  "type": "specific type (e.g., C30-40, Rebar, Profile With Coating)",
  "gwpSource": "A1-A3" or "ICE" or "none",
  "baselineEF": number (0 for Steps 1-5 items),
  "efUnit": "kgCO₂e/kg or kgCO₂e/m³ etc.",
  "materialUnit": "unit the EF expects",
  "confidence": "high" or "medium" or "low",
  "assumption": "classification reasoning — which Step matched and why"
}

## DOCUMENT TEXT (from: ${fileName || 'uploaded PDF'})
---
${text}
---

Return ONLY the JSON array. No markdown, no explanation.`;
}

// Parse and clean AI response into items array
function parseAIResponse(content) {
  let jsonStr = content.trim();
  // Remove markdown code blocks if present
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  const items = JSON.parse(jsonStr);
  if (!Array.isArray(items)) throw new Error('Response is not an array');
  return items;
}

// Validate and clean parsed items
function cleanItems(items) {
  return items.filter(item => {
    return item && item.description && typeof item.qty === 'number';
  }).map((item, idx) => {
    let desc = String(item.description || '');
    const itemNo = String(item.itemNo || idx + 1);

    // Fix: If description is the same as item number (AI mistake), try to recover
    if (desc === itemNo || /^[A-Z]?\d+\.?\d*$/.test(desc.trim())) {
      if (item.type && item.type.length > desc.length) {
        desc = item.type;
      } else if (item.assumption && item.assumption.length > 10) {
        desc = item.assumption;
      } else {
        desc = (item.category || 'Unknown') + ' - Item ' + itemNo;
      }
    }

    // Normalize lifecycle stage (handle "A5/D", "A5 D", "C1-C4" etc.)
    let stage = String(item.lifecycleStage || 'A1-A3').toUpperCase().replace(/\s+/g, '');
    if (stage.indexOf('A5') !== -1 || stage.indexOf('C1') !== -1) stage = 'A5';
    else if (stage === 'D') stage = 'D';
    else if (stage === 'A4') stage = 'A4';
    else if (!['A1-A3', 'A4', 'A5', 'D'].includes(stage)) stage = 'A1-A3';

    // Normalize confidence
    let confidence = String(item.confidence || 'medium').toLowerCase();
    if (!['high', 'medium', 'low'].includes(confidence)) confidence = 'medium';

    return {
      itemNo: itemNo,
      description: desc,
      qty: Number(item.qty) || 0,
      unit: String(item.unit || ''),
      thicknessMM: (item.thicknessMM != null && !isNaN(item.thicknessMM) && Number(item.thicknessMM) > 0) ? Number(item.thicknessMM) : null,
      lifecycleStage: stage,
      isDemolition: !!item.isDemolition,
      isComplexMEP: !!item.isComplexMEP,
      confidence: confidence,
      category: String(item.category || 'Unmatched'),
      type: String(item.type || desc || ''),
      gwpSource: item.gwpSource === 'A1-A3' ? 'A1-A3' : item.gwpSource === 'ICE' ? 'ICE' : 'none',
      baselineEF: Number(item.baselineEF) || 0,
      efUnit: String(item.efUnit || ''),
      materialUnit: String(item.materialUnit || item.unit || ''),
      assumption: String(item.assumption || '')
    };
  });
}

// Call Claude API for a single chunk with timeout protection
async function callClaude(apiKey, prompt) {
  // Use AbortController for 22-second timeout (Netlify max is 26s, leave margin)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 22000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16384,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error('API error ' + response.status + ': ' + errText);
    }

    const result = await response.json();
    const content = result.content && result.content[0] && result.content[0].text;
    if (!content) throw new Error('Empty response from AI');
    return content;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('AI response timeout (>22s) — try uploading a smaller document or use Excel/CSV format');
    }
    throw err;
  }
}

// Split text into chunks at line boundaries
function splitIntoChunks(text, maxCharsPerChunk) {
  if (text.length <= maxCharsPerChunk) return [text];

  const chunks = [];
  const lines = text.split('\n');
  let currentChunk = '';

  for (const line of lines) {
    if (currentChunk.length + line.length + 1 > maxCharsPerChunk && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = line;
    } else {
      currentChunk += (currentChunk ? '\n' : '') + line;
    }
  }
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();

  const csrf = csrfCheck(event);
  if (csrf) return csrf;

  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  // Verify authentication
  const user = await verifyToken(event);
  if (!user) return respond(401, { error: 'Unauthorized' });

  // Rate limiting
  const db = getDb();
  const clientId = getClientId(event, user);
  const rateCheck = await checkRateLimit(db, clientId, 'api');
  if (!rateCheck.allowed) {
    return respond(429, { error: 'Too many requests. Please wait ' + rateCheck.retryAfter + ' seconds.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return respond(500, { error: 'AI parsing not configured. Set ANTHROPIC_API_KEY in Netlify environment variables.' });
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return respond(400, { error: 'Invalid request body' });
  }

  const { text, fileName, chunkIndex, totalChunks } = body;
  if (!text || text.trim().length < 20) {
    return respond(400, { error: 'No text content provided or text too short' });
  }

  // If the client already chunked the text, process this single chunk directly
  // Otherwise, process the full text (with server-side chunking for very large texts)
  // Keep chunks small enough that Claude responds within Netlify's timeout (~22s)
  const maxCharsPerChunk = 25000;

  try {
    let allItems = [];
    let chunks;

    if (chunkIndex !== undefined && totalChunks !== undefined) {
      // Client has already chunked — process this single chunk
      chunks = [text.length > maxCharsPerChunk ? text.substring(0, maxCharsPerChunk) : text];
    } else if (text.length > maxCharsPerChunk) {
      // Server-side chunking for backward compatibility
      chunks = splitIntoChunks(text, maxCharsPerChunk);
    } else {
      chunks = [text];
    }

    for (let i = 0; i < chunks.length; i++) {
      const chunkInfo = chunks.length > 1 ? { current: i + 1, total: chunks.length } : null;
      const prompt = buildPrompt(chunks[i], fileName, chunkInfo);

      const content = await callClaude(apiKey, prompt);

      try {
        const items = parseAIResponse(content);
        const cleaned = cleanItems(items);
        allItems = allItems.concat(cleaned);
      } catch (parseErr) {
        console.error('Failed to parse AI response for chunk ' + (i + 1) + ':', content.substring(0, 500));
        // Continue with other chunks even if one fails
        if (chunks.length === 1) {
          return respond(502, { error: 'AI returned invalid JSON', fallback: true, raw: content.substring(0, 200) });
        }
      }
    }

    if (allItems.length === 0) {
      return respond(502, { error: 'No items parsed from document', fallback: true });
    }

    return respond(200, {
      success: true,
      items: allItems,
      totalParsed: allItems.length,
      chunksProcessed: chunks.length,
      model: 'claude-sonnet-4-20250514'
    });

  } catch (err) {
    console.error('AI parsing error:', err);
    return respond(500, { error: 'AI parsing failed. Please try again.', fallback: true });
  }
};
