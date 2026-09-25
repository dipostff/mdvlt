import type { Extension as FromMarkdownExtension } from 'mdast-util-from-markdown';
import { markdownLineEnding, markdownSpace, unicodeWhitespace } from 'micromark-util-character';
import { codes } from 'micromark-util-symbol';
import type { Code, Extension, State, Tokenizer } from 'micromark-util-types';
import type { Processor } from 'unified';
import type { Node } from 'unist';

/** `[[target#anchor|alias]]`, or an embed: `![[target#anchor|alias]]`. */
export interface WikiLink extends Node {
  type: 'wikiLink';
  /** Note name or path as written; `''` for a link within the same note (`[[#Heading]]`). */
  target: string;
  /** Heading (`Heading`, `Heading#Subheading`) or block reference (`^block-id`) after `#`. */
  anchor?: string;
  /** Text after `|`: what a link displays, or the size of an embedded image (`![[photo.png|300]]`). */
  alias?: string;
  embed: boolean;
}

declare module 'mdast' {
  interface PhrasingContentMap {
    wikiLink: WikiLink;
  }
  interface RootContentMap {
    wikiLink: WikiLink;
  }
}

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    wikiLink: 'wikiLink';
    wikiEmbed: 'wikiEmbed';
    wikiLinkMarker: 'wikiLinkMarker';
    wikiLinkContent: 'wikiLinkContent';
  }
}

/** Remark plugin that turns `[[...]]` and `![[...]]` into `wikiLink` nodes. */
export function remarkWikiLink(this: Processor): undefined {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(wikiLinkSyntax);
  (data.fromMarkdownExtensions ??= []).push(wikiLinkFromMarkdown);
}

/**
 * Splits the text between the brackets into `target#anchor|alias`. A `\|` separates the alias
 * too, because a bare `|` would end the cell inside a table.
 */
export function parseWikiLinkContent(
  content: string,
): Pick<WikiLink, 'target' | 'anchor' | 'alias'> {
  const pipe = content.indexOf('|');
  let destination = pipe === -1 ? content : content.slice(0, pipe);
  if (pipe !== -1 && destination.endsWith('\\')) destination = destination.slice(0, -1);
  const alias = pipe === -1 ? '' : content.slice(pipe + 1).replaceAll('\\|', '|');
  const hash = destination.indexOf('#');
  return {
    target: (hash === -1 ? destination : destination.slice(0, hash)).trim(),
    anchor: hash === -1 ? undefined : destination.slice(hash + 1).trim() || undefined,
    alias: alias.trim() || undefined,
  };
}

// Constructs of an extension run before the built-in ones for the same character, so `[[` is
// tried before a regular link and `![[` before an image.
const wikiLinkSyntax: Extension = {
  text: {
    [codes.leftSquareBracket]: { name: 'wikiLink', tokenize: tokenizer('wikiLink') },
    [codes.exclamationMark]: { name: 'wikiEmbed', tokenize: tokenizer('wikiEmbed') },
  },
};

const wikiLinkFromMarkdown: FromMarkdownExtension = {
  enter: {
    wikiLink(token) {
      this.enter({ type: 'wikiLink', target: '', embed: false }, token);
    },
    wikiEmbed(token) {
      this.enter({ type: 'wikiLink', target: '', embed: true }, token);
    },
  },
  exit: {
    wikiLinkContent(token) {
      const node = this.stack.at(-1);
      if (node?.type === 'wikiLink') {
        Object.assign(node, parseWikiLinkContent(this.sliceSerialize(token)));
      }
    },
    wikiLink(token) {
      this.exit(token);
    },
    wikiEmbed(token) {
      this.exit(token);
    },
  },
};

/**
 * The content may not contain brackets or line breaks, and the part before `|` needs something
 * besides spaces and `#`, so `[[]]`, `[[ ]]` and `[[|alias]]` stay plain text. A `[` inside makes
 * the outer brackets text, so in `[[a [[b]] c]]` only `[[b]]` is a link.
 */
function tokenizer(type: 'wikiLink' | 'wikiEmbed'): Tokenizer {
  return (effects, ok, nok) => {
    let inAlias = false;
    let hasDestination = false;

    const start: State = (code) => {
      effects.enter(type);
      effects.enter('wikiLinkMarker');
      if (type === 'wikiLink') return firstOpening(code);
      effects.consume(code);
      return firstOpening;
    };

    const firstOpening: State = (code) => {
      if (code !== codes.leftSquareBracket) return nok(code);
      effects.consume(code);
      return secondOpening;
    };

    const secondOpening: State = (code) => {
      if (code !== codes.leftSquareBracket) return nok(code);
      effects.consume(code);
      effects.exit('wikiLinkMarker');
      effects.enter('wikiLinkContent');
      return content;
    };

    const content: State = (code) => {
      if (code === codes.eof || code === codes.leftSquareBracket || markdownLineEnding(code)) {
        return nok(code);
      }
      if (code === codes.rightSquareBracket) {
        if (!hasDestination) return nok(code);
        effects.exit('wikiLinkContent');
        effects.enter('wikiLinkMarker');
        effects.consume(code);
        return secondClosing;
      }
      if (code === codes.backslash) {
        effects.consume(code);
        return afterBackslash;
      }
      if (code === codes.verticalBar) {
        inAlias = true;
      } else if (!inAlias && code !== codes.numberSign && !isWhitespace(code)) {
        hasDestination = true;
      }
      effects.consume(code);
      return content;
    };

    const afterBackslash: State = (code) => {
      if (code === codes.verticalBar) {
        inAlias = true;
        effects.consume(code);
        return content;
      }
      if (!inAlias) hasDestination = true;
      return content(code);
    };

    const secondClosing: State = (code) => {
      if (code !== codes.rightSquareBracket) return nok(code);
      effects.consume(code);
      effects.exit('wikiLinkMarker');
      effects.exit(type);
      return ok;
    };

    return start;
  };
}

function isWhitespace(code: Code): boolean {
  return markdownSpace(code) || unicodeWhitespace(code);
}
