// ===== AI-POWERED BOQ PARSING =====
// Uses Claude API to intelligently parse PDF BOQ text and match materials
// Supports chunked processing for large documents (parts 1-12+)
const { verifyToken, headers, respond, optionsResponse } = require('./utils/firebase');

// Build the AI prompt for a given text chunk
function buildPrompt(text, fileName, chunkInfo) {
  const chunkNote = chunkInfo
    ? `\n\nNOTE: This is chunk ${chunkInfo.current} of ${chunkInfo.total} from a large document. Parse ALL items in this chunk.`
    : '';

  return `You are an expert construction quantity surveyor and embodied carbon analyst.

## TASK
Parse the following extracted text from a PDF Bill of Quantities (BOQ) document.
Identify EVERY construction line item that represents actual work/material with a quantity.${chunkNote}

## UNDERSTANDING THE DOCUMENT FORMAT
This text was extracted from a PDF using PDF.js. The text is reconstructed from coordinates — columns are separated by tabs or multiple spaces. The document is a table with columns like:
- Item Number (e.g., "C2.97", "4.1.3", "B/1/001", "2.01")
- Description (the MAIN TEXT describing the work/material — this is usually the longest column)
- Quantity (a number)
- Unit (m², m³, kg, tonnes, nr, m, lin.m, etc.)
- Rate and Amount columns (ignore these — they are costs)

IMPORTANT: The text might be fragmented. Item numbers and descriptions might appear on separate fragments. You MUST reconstruct the full meaning. Look for patterns — short codes like "C2.97" or "B2.15" are ITEM NUMBERS, not descriptions. The DESCRIPTION is the longer text that explains what the work item is (e.g., "Supply and install 200mm dia HDPE pipe for storm water drainage").

## CRITICAL RULES
1. Read the FULL document carefully. Understand the structure — section headers, item numbers, descriptions, quantities, units.
2. Extract the EXACT item number as shown in the document (e.g., "C2.97", "4.1.3", "B/1/001").
3. Extract the COMPLETE description — do NOT summarize or truncate. Copy the FULL text describing the work.
4. NEVER use the item number (like "C2.97") as the description. The description MUST be the actual text explaining the work/material. If you cannot find a description, write "No description found - [item number]".
5. Extract the numeric quantity. If quantity says "Various" or is missing, set qty to 0.
6. Extract the unit as a CLEAN standard abbreviation: m², m³, kg, tonnes, nr, m, lin.m, etc. Do NOT include extra words like "Provisional" or "Sum" in the unit field — just the unit abbreviation. For example, if the BOQ says "(Provisional) m²", the unit is just "m²".
7. Match each item to the correct material category and GWP factor.
8. Skip preamble text, section headers, notes, and non-quantifiable items.
9. DO NOT make silly mistakes — "grouting" is NOT tin, it is cement/concrete. "GERCC" means General Excavation, Return, Compaction, and Carting — it is earthwork, NOT a metal.
10. Multi-line descriptions: If a description spans multiple lines, combine them into one complete description.
11. Look at section headers (like "STORM WATER DRAINAGE", "EARTHWORKS", "CONCRETE") to understand the context of items below them.
12. EXTRACT THICKNESS/DEPTH: If the description mentions a thickness, depth, or layer dimension (e.g., "depth 450mm", "150mm thick", "200mm layer", "thk 100mm"), extract it as "thicknessMM" in millimeters. This is CRITICAL for unit conversion (m² → m³). Do NOT confuse rebar diameter (e.g., "16mm dia rebar") or pipe diameter (e.g., "200mm dia HDPE") with layer thickness.
13. SKIP NON-MATERIAL ITEMS: Do NOT include these in the output:
    - Equipment/plant items (e.g., "Concrete mixer", "Crane", "Compactor", "Generator", "Scaffolding")
    - VAT, tax, or percentage lines (e.g., "Add VAT of Sub total", "Add 15% contingency")
    - Provisional sums, prime cost sums, day works
    - Preliminaries, general items, insurance, bonds, permits
    - Subtotals, totals, carried forward amounts
    - Labour-only items with no material content
    - Temporary works unless they involve permanent materials

## CONCRETE GRADE MATCHING — IMPORTANT
When matching concrete items to grades:
- If strength class is given as "F" value: F5.2 N/mm² ≈ C30-40, F10 ≈ C40-50, F3.5 ≈ C20-30
- "lean mix", "blinding", "mass concrete" ≈ C15-20
- "general structural", "foundations", "RC slabs" ≈ C30-40
- "high strength", "post-tensioned", "precast" ≈ C40-50 or C50-60
- PCC (Portland Cement Concrete) without grade specification ≈ C30-40

## MATERIAL MATCHING — A1-A3 CATEGORIES (Priority 1)
Match to these first. These are consultant-defined baseline emission factors:

Concrete [unit: m³, efUnit: kgCO₂e/m³]:
  C15-20 (baseline: 323), C20-30 (354), C30-40 (431), C40-50 (430), C50-60 (483), C60-70 (522)
  Matching: PCC, portland cement concrete, mass concrete, structural concrete, blinding, foundations, slabs

Steel [unit: kg, efUnit: kgCO₂e/kg]:
  Structural I-sections (2.46), Rebar (2.26), Hollow sections (2.52), Hot Dip Galvanized (2.74)
  Matching: reinforcement, rebar, mesh, fabric, steel bars, structural steel, galvanized

Asphalt [unit: tons, efUnit: kgCO₂e/ton]:
  3% Binder (50.1), 4% (52.2), 5% (54.2), 6% (56.3), 7% (58.4)
  Matching: asphalt, bituminous, wearing course, binder course, tarmac

Aluminum [unit: kg, efUnit: kgCO₂e/kg]:
  Profile Without Coating (10.8), Profile With Coating (10.8), Sheets (13.5)

Glass [unit: kg, efUnit: kgCO₂e/kg]:
  Annealed (1.28), Coated (1.61), Laminated (1.77), IGU (4.12)

Earth_Work [unit: tkm, efUnit: kgCO₂/tkm]:
  Excavation/Hauling (0.11), Demolition Removal (0.11)
  Matching: excavation, clearance, grading, leveling, earthwork, GERCC, GEVR, hauling, removal, demolition, site clearing

Subgrade [unit: kg, efUnit: kgCO₂e/kg]:
  Coarse & Fine Aggregate Recycled (0.0006), Coarse Aggregate (0.0103), Sand (0.0052)
  Matching: crushed aggregate, base course, sub-base, fill, granular, ABC, aggregate

Pipes [unit: m, efUnit: kgCO₂e/m]:
  600mm (179.9), 700mm (241.3), 800mm (307.2), 900mm (394.7), 1000mm (436.2), 1200mm (543.8), 1500mm (814.1), 1800mm (1138.3)

## ICE DATABASE CATEGORIES (Priority 2 — only if no A1-A3 match)
Concrete (ICE): C8-10 to C70-85, Precast, Lightweight, Fibre Reinforced, Blocks
Steel (ICE): I/H Sections, Rebar, Tubes, Galvanized, Coil, Plate, Stainless, Mesh, Piles
Timber: Softwood, Hardwood, Glulam, CLT, Plywood
Masonry: Brick (Common/Engineering/Facing), Mortar, Natural Stone
Ceramics: Floor/Wall tiles, Porcelain, Roof tiles
Cement: CEM I (0.91), CEM II (0.63-0.76), GGBS (0.07), Lime (0.76)
  Matching: cement, grouting, grout, injection, cementitious
Insulation: EPS, XPS, PIR, Mineral Wool, Glass Wool
Plastics: PVC, HDPE, PP, Polycarbonate
Waterproofing: Bitumen, EPDM, PVC membrane, TPO
Paints & Coatings: Water-based, Solvent-based, Primer, Intumescent
Plaster: Gypsum, Plasterboard, Render
Earthwork (ICE): Excavation (3.50/ton), Aggregates (5.20/ton), Sand (4.80/ton), Gravel (4.00/ton), Sub-base (4.40/ton)
Pipes (ICE): Ductile Iron, HDPE, PVC-U, GRP, Steel (various diameters)
MEP - HVAC: Ductwork, AHU, Chiller, Boiler, Heat Pump, FCU
MEP - Electrical: Cable, Cable Tray, Transformer, Switchgear, LED
MEP - Plumbing: Copper/PPR/CPVC/PEX pipe, Pumps, Tanks
MEP - Fire Protection: Sprinkler pipe, Fire pump, Dampers

## UNIT HANDLING — CRITICAL
- ALWAYS extract thickness/depth from description if present. Set "thicknessMM" to the value in mm.
- If BOQ quantity is in m² but the material factor is per m³ (e.g., concrete slab), the system will auto-convert using thickness. You MUST set thicknessMM.
- If BOQ quantity is in m³ and factor is per m³, use directly. Set thicknessMM to null.
- If BOQ gives weight (kg/tonnes), the system will auto-convert. Set thicknessMM to null.
- Examples of thickness extraction:
  - "Portland cement concrete, depth 450mm" → thicknessMM: 450
  - "Concrete slab 200mm thick" → thicknessMM: 200
  - "150mm blinding layer" → thicknessMM: 150
  - "Cement treated base course, thickness 150mm" → thicknessMM: 150
  - "200mm thick base course" → thicknessMM: 200
  - "layer thickness 100mm" → thicknessMM: 100
  - "Rebar B500B 16mm dia" → thicknessMM: null (bar diameter, NOT layer thickness)
  - "200mm dia HDPE pipe" → thicknessMM: null (pipe diameter, NOT layer thickness)

## OUTPUT FORMAT
Return ONLY a valid JSON array, no other text. Each element:
{
  "itemNo": "exact BOQ number (e.g. C2.97, 4.1.3)",
  "description": "THE FULL WORK DESCRIPTION — NOT the item number. Example: 'Supply and install 200mm dia HDPE pipe for storm water drainage including all fittings and jointing'. MUST be the actual description text, at least 10+ characters.",
  "qty": number,
  "unit": "clean unit abbreviation only (m², m³, kg, tonnes, nr, m, lin.m, etc.)",
  "thicknessMM": number or null (extracted thickness/depth in mm from the description, NOT pipe/rebar diameter),
  "category": "material category name from lists above",
  "type": "specific type name from lists above",
  "gwpSource": "A1-A3" or "ICE" or "none",
  "baselineEF": number (the emission factor),
  "efUnit": "unit of EF",
  "materialUnit": "the unit the EF expects (m³, kg, etc.)",
  "assumption": "explain what you assumed for this match"
}

CRITICAL: the "description" field must contain the ACTUAL work description, NOT the item number. If description says "C2.97" that is WRONG — that is an item number. Find the actual text that describes the work.

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

    return {
      itemNo: itemNo,
      description: desc,
      qty: Number(item.qty) || 0,
      unit: String(item.unit || ''),
      thicknessMM: (item.thicknessMM != null && !isNaN(item.thicknessMM) && Number(item.thicknessMM) > 0) ? Number(item.thicknessMM) : null,
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

// Call Claude API for a single chunk
async function callClaude(apiKey, prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 64000,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error('API error ' + response.status + ': ' + errText);
  }

  const result = await response.json();
  const content = result.content && result.content[0] && result.content[0].text;
  if (!content) throw new Error('Empty response from AI');
  return content;
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
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  // Verify authentication
  const user = await verifyToken(event);
  if (!user) return respond(401, { error: 'Unauthorized' });

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
  const maxCharsPerChunk = 60000;

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
    return respond(500, { error: 'AI parsing failed: ' + err.message, fallback: true });
  }
};
