// ── Token types ──

type TokenType = 'number' | 'letter' | 'op' | 'lparen' | 'rparen';

interface Token {
  type: TokenType;
  value: string;
}

// ── Tokenizer ──

// eslint-disable-next-line complexity -- lexer state machine with character-level branching
export function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = expression.trim();

  while (i < s.length) {
    const ch = s[i];

    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }

    if (ch >= 'A' && ch <= 'Z') {
      tokens.push({ type: 'letter', value: ch });
      i++;
      continue;
    }

    if (ch >= '0' && ch <= '9' || ch === '.') {
      let num = '';
      let dotCount = 0;
      while (i < s.length && (s[i] >= '0' && s[i] <= '9' || s[i] === '.')) {
        if (s[i] === '.') {
          dotCount++;
          if (dotCount > 1) { // eslint-disable-line max-depth -- number parsing validation
            throw new Error(`Invalid number: "${num}."`);
          }
        }
        num += s[i];
        i++;
      }
      if (!Number.isFinite(parseFloat(num))) {
        throw new Error(`Invalid number token: "${num}"`);
      }
      tokens.push({ type: 'number', value: num });
      continue;
    }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen', value: '(' });
      i++;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ')' });
      i++;
      continue;
    }

    throw new Error(`Unexpected character: "${ch}"`);
  }

  return tokens;
}

// ── Recursive descent parser ──
// expr     → term (('+' | '-') term)*
// term     → factor (('*' | '/') factor)*
// factor   → NUMBER | LETTER | '(' expr ')' | ('-' factor)

type ASTNode =
  | { type: 'number'; value: number }
  | { type: 'letter'; value: string }
  | { type: 'binary'; op: string; left: ASTNode; right: ASTNode }
  | { type: 'unary'; op: string; operand: ASTNode };

function parse(tokens: Token[]): ASTNode {
  let pos = 0;

  function peek(): Token | undefined {
    return tokens[pos];
  }

  function consume(): Token {
    return tokens[pos++];
  }

  function parseExpr(): ASTNode {
    let node = parseTerm();
    while (peek()?.type === 'op' && (peek()!.value === '+' || peek()!.value === '-')) {
      const op = consume().value;
      const right = parseTerm();
      node = { type: 'binary', op, left: node, right };
    }
    return node;
  }

  function parseTerm(): ASTNode {
    let node = parseFactor();
    while (peek()?.type === 'op' && (peek()!.value === '*' || peek()!.value === '/')) {
      const op = consume().value;
      const right = parseFactor();
      node = { type: 'binary', op, left: node, right };
    }
    return node;
  }

  function parseFactor(): ASTNode {
    const tok = peek();
    if (!tok) {throw new Error('Unexpected end of expression');}

    if (tok.type === 'number') {
      consume();
      return { type: 'number', value: parseFloat(tok.value) };
    }

    if (tok.type === 'letter') {
      consume();
      return { type: 'letter', value: tok.value };
    }

    if (tok.type === 'lparen') {
      consume();
      const node = parseExpr();
      const closing = peek();
      if (closing?.type !== 'rparen') {
        throw new Error('Missing closing parenthesis');
      }
      consume();
      return node;
    }

    // Unary minus
    if (tok.type === 'op' && tok.value === '-') {
      consume();
      const operand = parseFactor();
      return { type: 'unary', op: '-', operand };
    }

    throw new Error(`Unexpected token: "${tok.value}"`);
  }

  const ast = parseExpr();
  if (pos < tokens.length) {
    throw new Error(`Unexpected token after expression: "${tokens[pos].value}"`);
  }
  return ast;
}

// ── Evaluator ──

function evaluateAST(node: ASTNode, values: Map<string, number>): number {
  switch (node.type) {
    case 'number':
      return node.value;
    case 'letter': {
      return values.get(node.value) ?? 0;
    }
    case 'unary':
      return -evaluateAST(node.operand, values);
    case 'binary': {
      const left = evaluateAST(node.left, values);
      const right = evaluateAST(node.right, values);
      switch (node.op) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return right === 0 ? 0 : left / right;
        default: return 0;
      }
    }
  }
}

// ── Public API ──

export interface FormulaDataPoint {
  bucket: string;
  value: number;
}

/**
 * Evaluate a formula expression over series data.
 * @param expression  e.g. "B / A * 100"
 * @param seriesData  letter → (bucket → value)
 * @returns array of { bucket, value } sorted by bucket
 */
export function evaluateFormula(
  expression: string,
  seriesData: Map<string, Map<string, number>>,
): FormulaDataPoint[] {
  const tokens = tokenize(expression);
  const ast = parse(tokens);

  // Collect all buckets
  const bucketSet = new Set<string>();
  for (const bucketMap of seriesData.values()) {
    for (const bucket of bucketMap.keys()) {
      bucketSet.add(bucket);
    }
  }
  const buckets = Array.from(bucketSet).sort();

  return buckets.map((bucket) => {
    const values = new Map<string, number>();
    for (const [letter, bucketMap] of seriesData) {
      values.set(letter, bucketMap.get(bucket) ?? 0);
    }
    const value = evaluateAST(ast, values);
    return {
      bucket,
      value: Number.isFinite(value) ? value : 0,
    };
  });
}

/**
 * Validate a formula expression.
 * @param expression  e.g. "A / B * 100"
 * @param availableLetters  e.g. ["A", "B"]
 */
export function validateFormula(
  expression: string,
  availableLetters: string[],
): { valid: true } | { valid: false; error: string } {
  if (!expression.trim()) {
    return { valid: false, error: 'empty' };
  }

  try {
    const tokens = tokenize(expression);
    const ast = parse(tokens);

    // Check all referenced letters exist
    const usedLetters = new Set<string>();
    collectLetters(ast, usedLetters);

    for (const letter of usedLetters) {
      if (!availableLetters.includes(letter)) {
        return { valid: false, error: 'unknownSeries' };
      }
    }

    if (usedLetters.size === 0) {
      return { valid: false, error: 'noSeries' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'syntax' };
  }
}

function collectLetters(node: ASTNode, letters: Set<string>): void {
  switch (node.type) {
    case 'letter':
      letters.add(node.value);
      break;
    case 'binary':
      collectLetters(node.left, letters);
      collectLetters(node.right, letters);
      break;
    case 'unary':
      collectLetters(node.operand, letters);
      break;
  }
}
