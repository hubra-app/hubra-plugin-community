# Community

## 1.2.0

- What members lend to the club moved to Inventory, so the Skills & lending
  tab is gone (and the `/skills` API with it). An hourly job hands every old
  "lend" entry to Inventory through the `inventory.items.lend` contract,
  where it becomes an item that stays the member's own ("Lent by Anna"),
  and removes the entry once Inventory has it. Without Inventory (2.2 or
  later, switched on) the entries wait. "skill" rows stay in
  `community_skills` for Guides to copy. Community still imports nothing
  from Inventory.

## 1.1.0

- What members can do ("Kann") moved to qualifications: the Guides plugin's
  *Wer kann was* page, where members add it to themselves. The Skills tab
  lists only what members lend; adding a `skill` entry is refused. Old
  entries stay in `community_skills` for Guides 1.5.0 to copy; they no longer
  show here. Community still imports nothing from Guides.

## 1.0.0

First version: photo albums with tags and photo consent, a skills and
lending directory, an idea box with votes, answers and polls, honorary
members with membership jubilees and round birthdays, and a welcome
checklist for new members.
