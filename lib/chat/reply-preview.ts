/** Incrementally decode only the top-level reply string. Full schema validation still owns acceptance. */
export class ReplyPreview {
  private buffer = '';
  private cursor = 0;
  private state: 'start' | 'key' | 'colon' | 'value' | 'reply' | 'skip' | 'done' = 'start';
  private key = '';
  private seenReply = false;
  private depth = 0;
  private inString = false;
  private escaped = false;
  private length = 0;

  append(delta: string): string {
    this.buffer += delta;
    if (this.buffer.length > 65536) throw new Error('Answer arguments exceed preview limit');
    let output = '';
    while (this.cursor < this.buffer.length && this.state !== 'done') {
      const char = this.buffer[this.cursor];
      if (this.state !== 'reply' && this.state !== 'skip' && /\s/.test(char)) { this.cursor++; continue; }
      if (this.state === 'start') {
        if (char !== '{') throw new Error('Expected answer object');
        this.cursor++; this.state = 'key';
      } else if (this.state === 'key') {
        if (char === ',') { this.cursor++; continue; }
        if (char === '}') { this.state = 'done'; continue; }
        if (char !== '"') throw new Error('Expected answer key');
        let end = this.cursor + 1, escaped = false;
        for (; end < this.buffer.length; end++) {
          if (escaped) escaped = false;
          else if (this.buffer[end] === '\\') escaped = true;
          else if (this.buffer[end] === '"') break;
        }
        if (end === this.buffer.length) break;
        this.key = JSON.parse(this.buffer.slice(this.cursor, end + 1));
        this.cursor = end + 1; this.state = 'colon';
      } else if (this.state === 'colon') {
        if (char !== ':') throw new Error('Expected answer field separator');
        this.cursor++; this.state = 'value';
      } else if (this.state === 'value') {
        if (this.key === 'reply') {
          if (this.seenReply || char !== '"') throw new Error('Invalid reply field');
          this.seenReply = true; this.cursor++; this.state = 'reply';
        } else {
          this.depth = 0; this.inString = false; this.escaped = false; this.state = 'skip';
        }
      } else if (this.state === 'reply') {
        if (char === '"') { this.cursor++; this.state = 'skip'; continue; }
        if (char === '\\') {
          if (this.cursor + 1 >= this.buffer.length) break;
          const escape = this.buffer[this.cursor + 1];
          const end = this.cursor + (escape === 'u' ? 6 : 2);
          if (end > this.buffer.length) break;
          output += JSON.parse('"' + this.buffer.slice(this.cursor, end) + '"');
          this.cursor = end;
        } else {
          if (char.charCodeAt(0) < 32) throw new Error('Invalid reply character');
          output += char; this.cursor++;
        }
      } else {
        if (!this.inString && this.depth === 0 && (char === ',' || char === '}')) {
          this.state = char === '}' ? 'done' : 'key'; this.cursor++; continue;
        }
        if (this.escaped) this.escaped = false;
        else if (this.inString && char === '\\') this.escaped = true;
        else if (char === '"') this.inString = !this.inString;
        else if (!this.inString && (char === '{' || char === '[')) this.depth++;
        else if (!this.inString && (char === '}' || char === ']')) this.depth--;
        this.cursor++;
      }
    }
    this.length += output.length;
    if (this.length > 12000) throw new Error('Reply exceeds preview limit');
    return output;
  }
}
