// ===== AI-POWERED BOQ PARSING =====
// Uses Claude API to intelligently parse PDF BOQ text and match materials
const { verifyToken, headers, respond, optionsResponse } = require('./utils/firebase');

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

  const { text, fileName } = body;
  if (!text || text.trim().length < 20) {
    return respond(400, { error: 'No text content provided or text too short' });
  }

  // Truncate very long documents to stay within token limits
  const maxChars = 80000;
  const truncatedText = text.length > maxChars ? text.substring(0, maxChars) + '\n[... document truncated ...]' : text;

  const prompt = `You are an expert construction quantity surveyor and embodied carbon analyst.

## TASK
Parse the following extracted text from a PDF Bill of Quantities (BOQ) document.
Identify EVERY construction line item that represents actual work/material with a quantity.

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
6. Extract the unit exactly as shown (m², m³, kg, tonnes, nr, m, lin.m, etc.).
7. Match each item to the correct material category and GWP factor.
8. Skip preamble text, section headers, notes, and non-quantifiable items.
9. DO NOT make silly mistakes — "grouting" is NOT tin, it is cement/concrete. "GERCC" means General Excavation, Return, Compaction, and Carting — it is earthwork, NOT a metal.
10. Multi-line descriptions: If a description spans multiple lines, combine them into one complete description.
11. Look at section headers (like "STORM WATER DRAINAGE", "EARTHWORKS", "CONCRETE") to understand the context of items below them.
12. EXTRACT THICKNESS/DEPTH: If the description mentions a thickness, depth, or layer dimension (e.g., "depth 450mm", "150mm thick", "200mm layer", "thk 100mm"), extract it as "thicknessMM" in millimeters. This is CRITICAL for unit conversion (m² → m³). Do NOT confuse rebar diameter (e.g., "16mm dia rebar") or pipe diameter (e.g., "200mm dia HDPE") with layer thickness.

## MATERIAL MATCHING — A1-A3 CATEGORIES (Priority 1)
Match to these first. These are consultant-defined baseline emission factors:

Concrete [unit: m³, efUnit: kgCO₂e/m³]:
  C15-20 (baseline: 323), C20-30 (354), C30-40 (431), C40-50 (430), C50-60 (483), C60-70 (522)
  Matching: PCC, portland cement concrete, mass concrete, structural concrete, blinding, foundations, slabs
  Strength hint: F5.2 N/mm² ≈ C30-40, F10 ≈ C40-50, general structural ≈ C30-40, lean mix/blinding ≈ C15-20

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
  - "Rebar B500B 16mm dia" → thicknessMM: null (bar diameter, NOT layer thickness)
  - "200mm dia HDPE pipe" → thicknessMM: null (pipe diameter, NOT layer thickness)

## OUTPUT FORMAT
Return ONLY a valid JSON array, no other text. Each element:
{
  "itemNo": "exact BOQ number (e.g. C2.97, 4.1.3)",
  "description": "THE FULL WORK DESCRIPTION — NOT the item number. Example: 'Supply and install 200mm dia HDPE pipe for storm water drainage including all fittings and jointing'. MUST be the actual description text, at least 10+ characters.",
  "qty": number,
  "unit": "unit as in BOQ",
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
${truncatedText}
---

Return ONLY the JSON array. No markdown, no explanation.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
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

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', response.status, errText);
      return respond(502, { error: 'AI service error: ' + response.status, fallback: true });
    }

    const result = await response.json();
    const content = result.content && result.content[0] && result.content[0].text;

    if (!content) {
      return respond(502, { error: 'Empty response from AI', fallback: true });
    }

    // Parse JSON from response — handle potential markdown wrapping
    let items;
    try {
      let jsonStr = content.trim();
      // Remove markdown code blocks if present
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      }
      items = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error('Failed to parse AI response as JSON:', content.substring(0, 500));
      return respond(502, { error: 'AI returned invalid JSON', fallback: true, raw: content.substring(0, 200) });
    }

    if (!Array.isArray(items)) {
      return respond(502, { error: 'AI response is not an array', fallback: true });
    }

    // Validate and clean each item
    const cleaned = items.filter(item => {
      return item && item.description && typeof item.qty === 'number';
    }).map((item, idx) => {
      let desc = String(item.description || '');
      const itemNo = String(item.itemNo || idx + 1);

      // Fix: If description is the same as item number (AI mistake), try to recover
      // Common patterns: "C2.97", "B2.15", "4.1.3" etc.
      if (desc === itemNo || /^[A-Z]?\d+\.?\d*$/.test(desc.trim())) {
        // Description is just a code — use type or category + assumption as fallback
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

    return respond(200, {
      success: true,
      items: cleaned,
      totalParsed: cleaned.length,
      model: 'claude-sonnet-4-20250514'
    });

  } catch (err) {
    console.error('AI parsing error:', err);
    return respond(500, { error: 'AI parsing failed: ' + err.message, fallback: true });
  }
};
