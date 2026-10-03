# Inquiries

Questions sent to [Abyssata](https://abyssata.blog), and her answers. Lives at ask.abyssata.blog, a sibling of Temenos (garden.abyssata.blog) and Miscellany (misc.abyssata.blog).

## How a question reaches you

Anyone can type a question into the box at the top of the site, with a name if they want to leave one. It's sent by [Web3Forms](https://web3forms.com) to your email. Nothing appears on the site until you answer it.

The key that connects the box to your inbox is `web3formsKey` at the top of `build.mjs`.

## Answering

1. Open this folder in Obsidian as its own vault.
2. Make a new note in `answers/`. Each note is one answered question.
3. Put the question at the top as a quote (a line starting with `>`), then write your answer beneath it.
4. Commit and push in GitHub Desktop. The site rebuilds itself in a minute or two.

```
---
by: marrow
---
> What first drew you to Jung rather than Freud?

Freud gave me a map of the cellar…
```

**Who asked.** Put the name they left after `by:`. Leave it empty and the question shows as *anonymous*.

**The template.** `templates/Inquiry.md` sets up the top part for you. In Obsidian, go to Settings → Core plugins → turn on *Templates*, set its folder to `templates`, then use *Templates: Insert template* in a new note.

**When an answer is dated.** Turn on Obsidian's core plugin *Unique note creator* (with its folder set to `answers`). Its button makes a note named with the current time, like `202610031432`, and that becomes the answer's date. Otherwise an answer is dated when it was first committed. To set the date by hand, add `date: 2026-10-03` in the top block.

**Drafts.** Add `draft: true` in the top block and the answer stays off the site until you remove it.

**Images.** Drop them into `answers/attachments` and embed as usual: `![[photo.jpg]]`.

Also works in answers: `**bold**` (shows in oxblood), `*italics*`, `> quotes`, lists, `==highlights==`, and `%% private comments %%` (never published). Questions you haven't answered yet can wait in `private/`, which is never pushed or published.

## Changing things

- `build.mjs`, at the top (`SITE`): the name, subtitle, links, the words around the ask box, answers per page, the Web3Forms key
- `site/style.css`: the whole design
- `site/site.js`: sending the question without leaving the page, and the search line

To preview on your computer: `npm install` once, then `npm run serve` and open http://localhost:8080.
