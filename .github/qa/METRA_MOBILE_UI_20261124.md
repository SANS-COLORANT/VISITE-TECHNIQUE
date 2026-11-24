# METRA — mobile usability regression, 24 November

Reproduction: technical pilotage matrix width and nested vertical lists, equipment catalog header consuming viewport, root dock indicator moving while content remains stationary. No user screenshots or production data included.

- Pilotage: single virtualized vertical list, responsive column window, sticky headers and explicit previous/next category controls; sites/locals remain legible and all categories accessible. Exports/filtering unchanged. Badge number follows status instead of accidentally showing SO in a green cell.
- Equipment: catalog header, visual settings and setting tabs scroll together with the virtualized list; brand/model detail lists have bounded flexible viewports.
- Root pager: shared absolute animated page index moves both adjacent page and dock, route commit on release and cancellation; no independent bubble travel. Back gesture on nested screens starts at edge only.
- AAB46 native qualification never ran because emulator-runner split a multiline shell case statement into separate commands. Dispatcher is a single invocation. Existing restoration gates retained, new phone UI scenario added using synthetic data and 360dp portrait, font scale 1.2.
- Qualification on Android emulator is not a Samsung/tablet physical-device approval. No automatic Play publication.
