/**
 * formula-engine — lightweight client-side formula evaluator.
 *
 * Formulas use the syntax: [SourceValue1] + [SourceValue2] * 2
 * References are wrapped in square brackets and map to row SourceValues.
 *
 * Implements the Shunting-yard algorithm (infix → RPN → evaluate).
 * No external dependencies. ~150 lines.
 *
 * WCAG: formula display uses aria-label to describe computed values.
 */

export interface FormulaValidationResult {
  valid: boolean;
  error?: string;
}

// ── Token types ───────────────────────────────────────────────────────────────

type TokenType = 'number' | 'reference' | 'operator' | 'lparen' | 'rparen';

interface Token {
  type: TokenType;
  value: string;   // raw string for ref/operator, numeric string for number
}

const OPERATORS: Record<string, { precedence: number; leftAssoc: boolean }> = {
  '+': { precedence: 1, leftAssoc: true },
  '-': { precedence: 1, leftAssoc: true },
  '*': { precedence: 2, leftAssoc: true },
  '/': { precedence: 2, leftAssoc: true },
};

// ── Tokenise ──────────────────────────────────────────────────────────────────

function tokenise(formula: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < formula.length) {
    const ch = formula[i];

    // Skip whitespace
    if (/\s/.test(ch)) { i++; continue; }

    // Reference: [SomeName]
    if (ch === '[') {
      const end = formula.indexOf(']', i);
      if (end === -1) throw new Error('Unclosed square bracket in formula');
      tokens.push({ type: 'reference', value: formula.slice(i + 1, end) });
      i = end + 1;
      continue;
    }

    // Number (including decimals)
    if (/[\d.]/.test(ch)) {
      let numStr = '';
      while (i < formula.length && /[\d.]/.test(formula[i])) { numStr += formula[i++]; }
      tokens.push({ type: 'number', value: numStr });
      continue;
    }

    // Operators
    if (OPERATORS[ch]) {
      tokens.push({ type: 'operator', value: ch });
      i++; continue;
    }

    if (ch === '(') { tokens.push({ type: 'lparen',  value: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen',  value: ')' }); i++; continue; }

    throw new Error(`Invalid character in formula: "${ch}"`);
  }
  return tokens;
}

// ── Shunting-yard → RPN ───────────────────────────────────────────────────────

function toRpn(tokens: Token[]): Token[] {
  const output: Token[] = [];
  const ops: Token[] = [];

  for (const tok of tokens) {
    if (tok.type === 'number' || tok.type === 'reference') {
      output.push(tok); continue;
    }
    if (tok.type === 'operator') {
      const op = OPERATORS[tok.value];
      while (ops.length > 0) {
        const top = ops[ops.length - 1];
        if (top.type === 'lparen') break;
        if (top.type !== 'operator') break;
        const topOp = OPERATORS[top.value];
        if (topOp.precedence > op.precedence || (topOp.precedence === op.precedence && op.leftAssoc)) {
          output.push(ops.pop()!);
        } else break;
      }
      ops.push(tok); continue;
    }
    if (tok.type === 'lparen') { ops.push(tok); continue; }
    if (tok.type === 'rparen') {
      while (ops.length > 0 && ops[ops.length - 1].type !== 'lparen') output.push(ops.pop()!);
      if (ops.length === 0) throw new Error('Parentesi tonde non bilanciate');
      ops.pop(); // discard lparen
      continue;
    }
  }

  while (ops.length > 0) {
    const top = ops.pop()!;
    if (top.type === 'lparen') throw new Error('Parentesi tonde non bilanciate');
    output.push(top);
  }

  return output;
}

// ── Evaluate RPN ──────────────────────────────────────────────────────────────

function evalRpn(rpn: Token[], context: Record<string, number>): number {
  const stack: number[] = [];

  for (const tok of rpn) {
    if (tok.type === 'number') {
      stack.push(parseFloat(tok.value)); continue;
    }
    if (tok.type === 'reference') {
      const v = context[tok.value];
      stack.push(typeof v === 'number' && !isNaN(v) ? v : 0);
      continue;
    }
    if (tok.type === 'operator') {
      const b = stack.pop() ?? 0;
      const a = stack.pop() ?? 0;
      if (tok.value === '+') stack.push(a + b);
      else if (tok.value === '-') stack.push(a - b);
      else if (tok.value === '*') stack.push(a * b);
      else if (tok.value === '/') stack.push(b !== 0 ? a / b : 0);
      continue;
    }
  }

  if (stack.length !== 1) throw new Error('Formula malformata');
  return stack[0];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Evaluates a formula string using a context map of { sourceValue → numericValue }.
 * Returns null if the formula is empty or throws on parse errors.
 */
export function evaluateFormula(
  formula: string | null,
  context: Record<string, number>,
): number | null {
  if (!formula || formula.trim() === '') return null;
  try {
    const tokens = tokenise(formula);
    const rpn    = toRpn(tokens);
    return evalRpn(rpn, context);
  } catch {
    return null;
  }
}

/**
 * Validates a formula without evaluating it.
 * Checks syntax and that all references are in `availableRefs`.
 */
export function validateFormula(
  formula: string,
  availableRefs: string[],
): FormulaValidationResult {
  if (!formula || formula.trim() === '') {
    return { valid: false, error: 'La formula è vuota' };
  }
  try {
    const tokens = tokenise(formula);
    toRpn(tokens); // checks balanced parens and operator placement

    // Check all references exist
    const refs = new Set(availableRefs);
    for (const tok of tokens) {
      if (tok.type === 'reference' && !refs.has(tok.value)) {
        return { valid: false, error: `Riferimento sconosciuto: "${tok.value}"` };
      }
    }
    return { valid: true };
  } catch (err) {
    return { valid: false, error: (err as Error).message };
  }
}

/**
 * Extracts all [Reference] names from a formula string.
 */
export function extractReferences(formula: string): string[] {
  const refs: string[] = [];
  const rx = /\[([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(formula)) !== null) refs.push(m[1]);
  return refs;
}
