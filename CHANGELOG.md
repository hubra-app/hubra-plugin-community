# Community

## 1.4.0

- **Security:** turning an idea into a poll now needs the right to create polls (`polls.polls.create`) as well; before, answering ideas was enough because the poll was made as the system.
- **Security:** photos that claim more than 60 megapixels are refused before they are decoded, so a small file can't take gigabytes of memory. Pillow's global limit is no longer changed for all of Hubra.
- **Security:** welcome step links like `//other.site` or `/\other.site` are refused (they lead off the club's app); the checklist opens them as outside links in any case.
- Uploading photos and posting ideas are limited to 10 a minute per person.
- **Privacy:** jubilees (tab, widget and the board's reminders) show a round birthday only to those who may edit members (`members.members.update`), unless the member shares their birthday in the club's directory. Membership jubilees stay as they were.
- **Privacy:** when a member takes back their own anonymous idea, the audit log no longer names them.
- Picking the honorary members' tier and moving members onto it now also need the right to edit members (`members.members.update`): the tier's members show to everyone, and moving changes their tier and fee. With only `community.honours.update` the tab shows the choice greyed out.
- Gallery: deleting a photo is red text at the left of the dialog, like other dialogs.
- **Photo albums move to Documents.** With Documents on, the Gallery tab points to Dokumente › Fotos, and Documents takes the albums over (photos, captions, tags, opt-outs). It reads them through the new queries `community.albums.export` and `community.photos.optouts`. Without Documents, the gallery works as before. A later major version drops the gallery here.

## 1.3.0

- Gives the standard roles access when a club first switches it on (`role_defaults`, docs/roles.md in hubra-app/hubra): Mitglied Ansehen, Vorstand Bearbeiten. Roles without access don't see it; their own data from it stays on their profile. Needs Hubra 0.2.5 or later.
- Dashboard widgets: **Beliebteste Ideen** (open and planned ideas with the most votes) and **Jubiläen und Geburtstage** (membership jubilees and round birthdays in the next days; needs `community.honours.update`).

## 1.2.2

1.2.1 was tagged but couldn't be signed, so it was never released. 1.2.2 is the same plugin, signed. What it brings:

- What members can do ("Kann") moved to qualifications: the Guides plugin's
  *Wer kann was* page (Guides 1.5.0), where members add it to themselves and
  others confirm it. Old entries stay in `community_skills` for Guides to
  copy.
- What members lend to the club moved to Inventory, so the Skills & lending
  tab is gone (and the `/skills` API with it). An hourly job hands every old
  "lend" entry to Inventory through the `inventory.items.lend` contract,
  where it becomes an item that stays the member's own ("Lent by Anna"),
  and removes the entry once Inventory has it. Without Inventory (2.2 or
  later, switched on) the entries wait. Community still imports nothing
  from Guides or Inventory.

## 1.2.1

1.2.0 was tagged but couldn't be signed, so it was never released. 1.2.1 is the same plugin, signed. What 1.2.0 brings:

- What members can do ("Kann") moved to qualifications: the Guides plugin's
  *Wer kann was* page (Guides 1.5.0), where members add it to themselves and
  others confirm it. Old entries stay in `community_skills` for Guides to
  copy.
- What members lend to the club moved to Inventory, so the Skills & lending
  tab is gone (and the `/skills` API with it). An hourly job hands every old
  "lend" entry to Inventory through the `inventory.items.lend` contract,
  where it becomes an item that stays the member's own ("Lent by Anna"),
  and removes the entry once Inventory has it. Without Inventory (2.2 or
  later, switched on) the entries wait. Community still imports nothing
  from Guides or Inventory.

## 1.2.0

- What members can do ("Kann") moved to qualifications: the Guides plugin's
  *Wer kann was* page (Guides 1.5.0), where members add it to themselves and
  others confirm it. Old entries stay in `community_skills` for Guides to
  copy.
- What members lend to the club moved to Inventory, so the Skills & lending
  tab is gone (and the `/skills` API with it). An hourly job hands every old
  "lend" entry to Inventory through the `inventory.items.lend` contract,
  where it becomes an item that stays the member's own ("Lent by Anna"),
  and removes the entry once Inventory has it. Without Inventory (2.2 or
  later, switched on) the entries wait. Community still imports nothing
  from Guides or Inventory.

## 1.1.0

Honorary members are a membership tier now, like every other kind of
member. The board picks the tier on the Honours tab (setting
`honour_tier_id`); the tab shows that tier's members, and their fee is the
tier's. The separate honours list (title, date, note per member) is gone:
honours kept with 1.0 show to the board until it moves those members onto
the tier or drops the list. Jubilees and their reminders stay.

## 1.0.0

First version: photo albums with tags and photo consent, a skills and
lending directory, an idea box with votes, answers and polls, honorary
members with membership jubilees and round birthdays, and a welcome
checklist for new members.
