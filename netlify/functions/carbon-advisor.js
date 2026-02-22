// ===== Carbon Reduction Advisor — AI-powered analysis =====
// Uses Claude to analyze project emission data and generate
// actionable reduction strategies for consultants.
const { getDb, verifyToken, headers, respond, optionsResponse, csrfCheck } = require('./utils/firebase');
const { resetAnonymization, sanitizeProjectData, deAnonymizeResponse, createAIAuditEntry } = require('./lib/ai-privacy');
const { checkPromptInjection, validatePayloadSize } = require('./lib/sanitize');
const { getClientId, checkRateLimit } = require('./lib/rate-limit');

function buildAdvisorPrompt(data) {
  const { project, target, totals, materials, contractors } = data;
  const gap = target - totals.reduction;
  const meetsTarget = totals.reduction >= target;

  return `You are an expert Embodied Carbon Consultant analyzing a construction project's carbon emissions data. Your goal is to provide actionable, specific reduction strategies to help the project ${meetsTarget ? 'maintain' : 'reach'} its ${target}% reduction target.

PROJECT: ${project.name}${project.code ? ' (' + project.code + ')' : ''}
TARGET: ${target}% reduction from baseline
CURRENT REDUCTION: ${totals.reduction}%
${meetsTarget ? 'STATUS: Target met — focus on further optimization' : 'GAP TO CLOSE: ' + gap.toFixed(1) + '% more reduction needed'}

BASELINE: ${totals.baseline.toFixed(2)} tCO₂eq
ACTUAL: ${totals.actual.toFixed(2)} tCO₂eq
SAVINGS: ${(totals.baseline - totals.actual).toFixed(2)} tCO₂eq
A5 SITE EMISSIONS: ${totals.a5.toFixed(2)} tCO₂eq

MATERIAL BREAKDOWN (by actual emissions):
${materials.map(m => `- ${m.name}: Baseline ${m.baseline.toFixed(1)} → Actual ${m.actual.toFixed(1)} tCO₂ (${m.reduction}% reduction, ${m.entries} entries)`).join('\n')}

CONTRACTOR PERFORMANCE:
${contractors.map(c => `- ${c.name}: ${c.reduction}% reduction (${c.entries} entries, ${c.actual.toFixed(1)} tCO₂ actual)${c.reduction < target ? ' ⚠ BELOW TARGET' : ' ✓'}`).join('\n')}

Provide your analysis in the following structure:

## Executive Summary
One paragraph: current status, key findings, and whether the project can realistically meet the target.

## Top Contributors to Emissions
Rank the materials by their share of total actual emissions. For each:
- What percentage of total emissions it represents
- Current reduction vs target
- Specific reduction potential

## Reduction Strategy
For each material category that is underperforming or has significant volume, provide:
- Specific alternative materials or specifications (with approximate emission factors)
- Expected reduction if the alternative is adopted
- Practical implementation notes (availability, cost implications, certification)

## Contractor Action Items
For each contractor below target:
- What materials they primarily use
- Specific actions they should take
- Realistic reduction they can achieve

## KPI Pathway
${meetsTarget ? 'How to maintain and improve the current performance.' : `Quantify exactly how to close the ${gap.toFixed(1)}% gap:`}
- Which material switches would yield the biggest impact
- Tonnage of CO₂ that needs to be eliminated
- Priority order of actions (quick wins vs long-term)

Keep responses concise, data-driven, and actionable. Use specific numbers from the data provided. Format with markdown headers and bullet points.`;
}

async function callClaude(apiKey, prompt) {
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
        max_tokens: 4096,
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
    if (err.name === 'AbortError') throw new Error('AI request timed out (22s). Try again.');
    throw err;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const csrf = csrfCheck(event);
  if (csrf) return csrf;

  if (event.httpMethod !== 'POST') {
    return respond(405, { error: 'Method not allowed' });
  }

  // Verify authentication
  const user = await verifyToken(event);
  if (!user) {
    return respond(401, { error: 'Unauthorized' });
  }

  // Rate limiting for AI calls
  const db = getDb();
  const clientId = getClientId(event, user);
  const rateCheck = await checkRateLimit(db, clientId, 'ai');
  if (!rateCheck.allowed) {
    return respond(429, { error: 'Too many AI requests. Please wait ' + rateCheck.retryAfter + ' seconds.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return respond(500, { error: 'AI advisor not configured. Set ANTHROPIC_API_KEY in Netlify environment variables.' });
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return respond(400, { error: 'Invalid request body' });
  }

  // Validate payload size
  const sizeCheck = validatePayloadSize(body, 2 * 1024 * 1024); // 2MB max
  if (!sizeCheck.valid) {
    return respond(413, { error: sizeCheck.error });
  }

  const { project, target, totals, materials, contractors } = body;
  if (!project || !totals || !materials) {
    return respond(400, { error: 'Missing required data: project, totals, materials' });
  }

  // Check for prompt injection in user-supplied fields
  const injectionCheck = checkPromptInjection(project.name || '');
  if (!injectionCheck.safe) {
    return respond(400, { error: 'Invalid input detected in project data.' });
  }

  try {
    // Apply AI data privacy — anonymize/redact before sending to Claude
    resetAnonymization();
    const sanitizedBody = {
      ...body,
      ...sanitizeProjectData(body),
    };

    const prompt = buildAdvisorPrompt(sanitizedBody);
    let analysis = await callClaude(apiKey, prompt);

    // De-anonymize the response so client sees real names
    analysis = deAnonymizeResponse(analysis);

    // Audit log the AI call (without storing actual content)
    const auditEntry = createAIAuditEntry(user.uid, 'carbon-advisor', {
      projectId: project.id || project.name,
      totalChars: prompt.length,
      piiRedacted: true,
      promptPreview: prompt.substring(0, 100),
    });
    await db.ref('aiAuditLogs/' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)).set(auditEntry);

    return respond(200, {
      success: true,
      analysis,
      project: project.name,
      model: 'claude-sonnet-4-20250514',
      privacyApplied: true,
    });
  } catch (err) {
    console.error('Carbon advisor error:', err);
    return respond(500, { error: 'AI analysis failed. Please try again.' });
  }
};
