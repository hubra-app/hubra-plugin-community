# Community

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
