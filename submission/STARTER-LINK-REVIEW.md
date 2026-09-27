# Starter playback link review

Reviewed September 27, 2026. All 223 titles were checked against public provider metadata (YouTube uses its public oEmbed response). This confirms title/episode identity and playback routing; it does not verify signed-in, regional or subscription playback. The catalog stays optional and the public user library stays empty.

- Disney+: 81 movie playback routes retained. The public name "101 Dalmatians" matches the catalog's "One Hundred and One Dalmatians". Signed-out requests can redirect to a browse page.
- Netflix: 47 movies now use /watch/; three series use actual episode IDs from their season metadata. Christmas Inheritance was checked separately on its official title page after the batch download failed.
- Hulu: 37 series now use /watch/ with episode IDs from Hulu's public episode collections. The first listed available season/episode may differ from season one; some titles need an add-on subscription.
- Prime Video: seven movies and five series use the provider's own regional Watch now links with autoplay=1; series links identify episodes, not season pages. These are US starter routes; existing explicit other-region URLs are preserved.
- Tubi: 19 movie player pages retained; 18 series changed to actual /tv-shows/ episodes published in Tubi's structured metadata.
- YouTube: six direct watch links retain their verified title identity.

The playback-links.js table repairs known legacy starter routes when loading/importing a library or launching saved links. Import deduplication treats the old and corrected links as the same entry. Other episodes remain distinct. User notes, entry IDs and existing custom links are preserved.

Source pages are references only. The application launches the Playback column. Login, profile choice, PINs, entitlement checks and regional restrictions can still interrupt playback and must not be bypassed.

| Service | Title | Playback | Episode entry point | Public reference |
| --- | --- | --- | --- | --- |
| Disney+ | A Bug's Life | [Play](https://www.disneyplus.com/play/c255a738-ee7f-4569-ba89-acacb6e5cefb) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-c255a738-ee7f-4569-ba89-acacb6e5cefb) |
| Disney+ | Aladdin | [Play](https://www.disneyplus.com/play/bfad6284-a0aa-4ae1-8469-dc1653121dbb) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-bfad6284-a0aa-4ae1-8469-dc1653121dbb) |
| Disney+ | Alice in Wonderland | [Play](https://www.disneyplus.com/play/7ccabaf6-d01a-4163-a613-862f2c4f1446) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-7ccabaf6-d01a-4163-a613-862f2c4f1446) |
| Disney+ | Atlantis The Lost Empire | [Play](https://www.disneyplus.com/play/998ad7ff-51b8-47ec-b571-85152ba5d2ce) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-998ad7ff-51b8-47ec-b571-85152ba5d2ce) |
| Disney+ | Bambi | [Play](https://www.disneyplus.com/play/c5350c37-0c8f-4094-8e63-72bfef0a0b08) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-c5350c37-0c8f-4094-8e63-72bfef0a0b08) |
| Disney+ | Beauty and the Beast | [Play](https://www.disneyplus.com/play/97babebc-7013-455a-b377-aa3d7a6e79c1) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-97babebc-7013-455a-b377-aa3d7a6e79c1) |
| Disney+ | Big Hero 6 | [Play](https://www.disneyplus.com/play/c29f81d8-8c51-4fe7-bb0c-13f099ad3e90) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-c29f81d8-8c51-4fe7-bb0c-13f099ad3e90) |
| Disney+ | Bolt | [Play](https://www.disneyplus.com/play/571d9761-423b-4e7c-820e-a35c1faf1cf3) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-571d9761-423b-4e7c-820e-a35c1faf1cf3) |
| Disney+ | Brave | [Play](https://www.disneyplus.com/play/afc32deb-a674-4d4b-a87a-bb2b2bf8ef01) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-afc32deb-a674-4d4b-a87a-bb2b2bf8ef01) |
| Disney+ | Brother Bear | [Play](https://www.disneyplus.com/play/b463d937-ca30-40fe-ac95-72e232d06872) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-b463d937-ca30-40fe-ac95-72e232d06872) |
| Disney+ | Cars | [Play](https://www.disneyplus.com/play/9c1b0ec2-2e4e-4717-89fb-bdf3a45523df) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-9c1b0ec2-2e4e-4717-89fb-bdf3a45523df) |
| Disney+ | Cars 2 | [Play](https://www.disneyplus.com/play/fe92916d-0f0e-47ad-ad34-5931e59b42ea) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-fe92916d-0f0e-47ad-ad34-5931e59b42ea) |
| Disney+ | Cars 3 | [Play](https://www.disneyplus.com/play/610e18a4-d8d8-43b5-8051-672655e715f3) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-610e18a4-d8d8-43b5-8051-672655e715f3) |
| Disney+ | Chicken Little | [Play](https://www.disneyplus.com/play/08bc9ce4-7e46-4383-a500-fd5305bb8f2e) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-08bc9ce4-7e46-4383-a500-fd5305bb8f2e) |
| Disney+ | Cinderella | [Play](https://www.disneyplus.com/play/f7272318-0b08-46f5-b89e-284b3e8a7234) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-f7272318-0b08-46f5-b89e-284b3e8a7234) |
| Disney+ | Coco | [Play](https://www.disneyplus.com/play/ce1ccdca-f468-4960-b67c-026b01ba42ab) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-ce1ccdca-f468-4960-b67c-026b01ba42ab) |
| Disney+ | Dumbo | [Play](https://www.disneyplus.com/play/d71e65f7-36f1-4ae1-9e3b-4a794d0c970c) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-d71e65f7-36f1-4ae1-9e3b-4a794d0c970c) |
| Disney+ | Elemental | [Play](https://www.disneyplus.com/play/8b489955-d30c-45b6-90ee-ae70f92bd431) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-8b489955-d30c-45b6-90ee-ae70f92bd431) |
| Disney+ | Encanto | [Play](https://www.disneyplus.com/play/328b0ec7-6e50-4ead-aa7f-c8bb92e6f08a) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-328b0ec7-6e50-4ead-aa7f-c8bb92e6f08a) |
| Disney+ | Fantasia | [Play](https://www.disneyplus.com/play/f08e9233-5325-45ac-a070-134f9725f1fd) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-f08e9233-5325-45ac-a070-134f9725f1fd) |
| Disney+ | Fantasia 2000 | [Play](https://www.disneyplus.com/play/9d43141c-cba4-4562-bba4-30407312014f) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-9d43141c-cba4-4562-bba4-30407312014f) |
| Disney+ | Finding Dory | [Play](https://www.disneyplus.com/play/1898d521-c10f-46ca-b253-432a9eb5416f) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-1898d521-c10f-46ca-b253-432a9eb5416f) |
| Disney+ | Finding Nemo | [Play](https://www.disneyplus.com/play/37b62808-2368-4688-9410-2dcf7461e258) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-37b62808-2368-4688-9410-2dcf7461e258) |
| Disney+ | Frozen | [Play](https://www.disneyplus.com/play/04c97b72-504b-47f2-9c6f-fe13d9aea82f) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-04c97b72-504b-47f2-9c6f-fe13d9aea82f) |
| Disney+ | Frozen 2 | [Play](https://www.disneyplus.com/play/3f9272e2-33f1-47db-bb2e-9aa2c7c85a96) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-3f9272e2-33f1-47db-bb2e-9aa2c7c85a96) |
| Disney+ | Hercules | [Play](https://www.disneyplus.com/play/ae19dd2f-a945-442b-a18e-d57fa8f5091f) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-ae19dd2f-a945-442b-a18e-d57fa8f5091f) |
| Disney+ | Home on the Range | [Play](https://www.disneyplus.com/play/2f5b5aa7-7e11-4171-88fc-f2bcef3b5e1d) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-2f5b5aa7-7e11-4171-88fc-f2bcef3b5e1d) |
| Disney+ | Incredibles 2 | [Play](https://www.disneyplus.com/play/9da2c0fb-a380-4180-b67f-006fbaaa89ab) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-9da2c0fb-a380-4180-b67f-006fbaaa89ab) |
| Disney+ | Inside Out | [Play](https://www.disneyplus.com/play/d4b87168-7d0b-49bc-b138-457ab7723feb) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-d4b87168-7d0b-49bc-b138-457ab7723feb) |
| Disney+ | Inside Out 2 | [Play](https://www.disneyplus.com/play/ec9f9fa3-fbae-4a25-b722-12c3b8ab0ef4) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-ec9f9fa3-fbae-4a25-b722-12c3b8ab0ef4) |
| Disney+ | Lady and the Tramp | [Play](https://www.disneyplus.com/play/f8a68a49-f7c3-417d-baed-1ff7c7b862de) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-f8a68a49-f7c3-417d-baed-1ff7c7b862de) |
| Disney+ | Lilo & Stitch | [Play](https://www.disneyplus.com/play/e291d4ea-cd86-4eb2-9f39-20d2b75165ee) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-e291d4ea-cd86-4eb2-9f39-20d2b75165ee) |
| Disney+ | Luca | [Play](https://www.disneyplus.com/play/f28b825f-c207-406b-923a-67f85e6d90e0) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-f28b825f-c207-406b-923a-67f85e6d90e0) |
| Disney+ | Meet the Robinsons | [Play](https://www.disneyplus.com/play/768c3d1a-2952-401a-8e99-9fd1f42f13bc) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-768c3d1a-2952-401a-8e99-9fd1f42f13bc) |
| Disney+ | Moana | [Play](https://www.disneyplus.com/play/e8896bfa-1052-41f7-ae2e-00255d77cf05) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-e8896bfa-1052-41f7-ae2e-00255d77cf05) |
| Disney+ | Monsters Inc | [Play](https://www.disneyplus.com/play/3c90b85f-ba5e-4351-be87-e625d5706952) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-3c90b85f-ba5e-4351-be87-e625d5706952) |
| Disney+ | Monsters University | [Play](https://www.disneyplus.com/play/9b76e5cf-4005-4f0b-ae54-e65f3a6ccb61) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-9b76e5cf-4005-4f0b-ae54-e65f3a6ccb61) |
| Disney+ | Mulan | [Play](https://www.disneyplus.com/play/a89be7cf-d4a6-41e8-9e85-2040be26f401) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-a89be7cf-d4a6-41e8-9e85-2040be26f401) |
| Disney+ | Oliver & Company | [Play](https://www.disneyplus.com/play/10b2725c-2f6c-4646-929c-400a26c5e6fa) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-10b2725c-2f6c-4646-929c-400a26c5e6fa) |
| Disney+ | One Hundred and One Dalmatians | [Play](https://www.disneyplus.com/play/8eed72cc-3c4a-41cf-8e98-44a6b7f8f8d3) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-8eed72cc-3c4a-41cf-8e98-44a6b7f8f8d3) |
| Disney+ | Onward | [Play](https://www.disneyplus.com/play/8ae3cf63-a15a-465e-90d2-25fa32257894) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-8ae3cf63-a15a-465e-90d2-25fa32257894) |
| Disney+ | Peter Pan | [Play](https://www.disneyplus.com/play/92d66793-7198-45de-bfb6-84915256d855) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-92d66793-7198-45de-bfb6-84915256d855) |
| Disney+ | Pinocchio | [Play](https://www.disneyplus.com/play/bfe9c61c-f7f3-4e39-94bb-376bf2162c28) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-bfe9c61c-f7f3-4e39-94bb-376bf2162c28) |
| Disney+ | Pocahontas | [Play](https://www.disneyplus.com/play/87056d92-21b6-4e70-a0d4-a959b6c60599) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-87056d92-21b6-4e70-a0d4-a959b6c60599) |
| Disney+ | Ralph Breaks the Internet | [Play](https://www.disneyplus.com/play/4f2c48ef-b3f9-4422-9feb-011a17ff2afb) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-4f2c48ef-b3f9-4422-9feb-011a17ff2afb) |
| Disney+ | Ratatouille | [Play](https://www.disneyplus.com/play/ab7c4e29-04f1-46dd-931a-d43be1ce0f8c) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-ab7c4e29-04f1-46dd-931a-d43be1ce0f8c) |
| Disney+ | Raya and the Last Dragon | [Play](https://www.disneyplus.com/play/72aceacd-23df-4fc2-89fb-0b9595a764ca) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-72aceacd-23df-4fc2-89fb-0b9595a764ca) |
| Disney+ | Robin Hood | [Play](https://www.disneyplus.com/play/cd1967ec-90ec-4aa6-9476-809ba8fcf2b2) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-cd1967ec-90ec-4aa6-9476-809ba8fcf2b2) |
| Disney+ | Sleeping Beauty | [Play](https://www.disneyplus.com/play/2f365ad5-9a65-410e-b750-947acc66d21e) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-2f365ad5-9a65-410e-b750-947acc66d21e) |
| Disney+ | Snow White and the Seven Dwarfs | [Play](https://www.disneyplus.com/play/f51f7e6c-2d9a-443c-9831-f3cc22e822b4) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-f51f7e6c-2d9a-443c-9831-f3cc22e822b4) |
| Disney+ | Soul | [Play](https://www.disneyplus.com/play/5f055dc5-cc07-43f2-839e-bf073b16a823) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-5f055dc5-cc07-43f2-839e-bf073b16a823) |
| Disney+ | Tangled | [Play](https://www.disneyplus.com/play/197d29a0-7a57-4eca-afa9-da1c050c5abe) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-197d29a0-7a57-4eca-afa9-da1c050c5abe) |
| Disney+ | Tarzan | [Play](https://www.disneyplus.com/play/6246ebb7-7e52-4767-974c-5da108c6644f) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-6246ebb7-7e52-4767-974c-5da108c6644f) |
| Disney+ | The Aristocats | [Play](https://www.disneyplus.com/play/ddf5fd68-acd7-47ae-8632-22aa3b6a4ba8) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-ddf5fd68-acd7-47ae-8632-22aa3b6a4ba8) |
| Disney+ | The Black Cauldron | [Play](https://www.disneyplus.com/play/7a03fae2-00b5-4320-a617-4932e8734284) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-7a03fae2-00b5-4320-a617-4932e8734284) |
| Disney+ | The Emperor's New Groove | [Play](https://www.disneyplus.com/play/c749b7a9-21dd-41e3-80bc-bf5158177010) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-c749b7a9-21dd-41e3-80bc-bf5158177010) |
| Disney+ | The Fox and the Hound | [Play](https://www.disneyplus.com/play/65ec2407-38fc-479b-bc94-ac474770b84f) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-65ec2407-38fc-479b-bc94-ac474770b84f) |
| Disney+ | The Great Mouse Detective | [Play](https://www.disneyplus.com/play/e8fa6ca3-2982-4841-a947-e764a7f406b5) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-e8fa6ca3-2982-4841-a947-e764a7f406b5) |
| Disney+ | The Hunchback of Notre Dame | [Play](https://www.disneyplus.com/play/487dcb63-61e4-49ba-9f44-ce0aab176ab9) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-487dcb63-61e4-49ba-9f44-ce0aab176ab9) |
| Disney+ | The Incredibles | [Play](https://www.disneyplus.com/play/850b6e92-07ea-4211-b3c3-cbbf1de045fa) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-850b6e92-07ea-4211-b3c3-cbbf1de045fa) |
| Disney+ | The Jungle Book | [Play](https://www.disneyplus.com/play/9a969820-2c25-4cf9-a461-ed84696cdf19) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-9a969820-2c25-4cf9-a461-ed84696cdf19) |
| Disney+ | The Lion King | [Play](https://www.disneyplus.com/play/a3ae7371-39a5-4c0b-a1f2-29a70b372848) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-a3ae7371-39a5-4c0b-a1f2-29a70b372848) |
| Disney+ | The Little Mermaid | [Play](https://www.disneyplus.com/play/f7643452-fe64-4b05-8f09-c8bea9b2dd60) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-f7643452-fe64-4b05-8f09-c8bea9b2dd60) |
| Disney+ | The Many Adventures of Winnie the Pooh | [Play](https://www.disneyplus.com/play/921fe2fd-2b3b-42c0-8f80-67239d866a2e) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-921fe2fd-2b3b-42c0-8f80-67239d866a2e) |
| Disney+ | The Princess and the Frog | [Play](https://www.disneyplus.com/play/48fd96f1-8e02-4de0-a511-cc3f11fbfefd) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-48fd96f1-8e02-4de0-a511-cc3f11fbfefd) |
| Disney+ | The Rescuers | [Play](https://www.disneyplus.com/play/64104df1-6cac-4d26-9935-97c3fd1e582e) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-64104df1-6cac-4d26-9935-97c3fd1e582e) |
| Disney+ | The Rescuers Down Under | [Play](https://www.disneyplus.com/play/ffcbf9e8-27a1-4993-a4cd-b99fd0c1ebdb) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-ffcbf9e8-27a1-4993-a4cd-b99fd0c1ebdb) |
| Disney+ | The Sandlot | [Play](https://www.disneyplus.com/play/470d2a85-e2df-44f7-87f2-303290b3d008) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-470d2a85-e2df-44f7-87f2-303290b3d008) |
| Disney+ | The Sword in the Stone | [Play](https://www.disneyplus.com/play/32a38a47-e2f8-4c6d-8869-c9773e6ce749) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-32a38a47-e2f8-4c6d-8869-c9773e6ce749) |
| Disney+ | Toy Story | [Play](https://www.disneyplus.com/play/f6174ebf-cb92-453c-a52b-62bb3576e402) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-f6174ebf-cb92-453c-a52b-62bb3576e402) |
| Disney+ | Toy Story 2 | [Play](https://www.disneyplus.com/play/55bb8618-baac-449e-9f63-f402f41371a2) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-55bb8618-baac-449e-9f63-f402f41371a2) |
| Disney+ | Toy Story 3 | [Play](https://www.disneyplus.com/play/95e7b2ce-5f45-4923-976d-b7e9968a7357) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-95e7b2ce-5f45-4923-976d-b7e9968a7357) |
| Disney+ | Toy Story 4 | [Play](https://www.disneyplus.com/play/97d822a3-7dad-4d85-8350-ce4f8642511e) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-97d822a3-7dad-4d85-8350-ce4f8642511e) |
| Disney+ | Treasure Planet | [Play](https://www.disneyplus.com/play/0d81bf5b-5d8b-497d-90cd-314cbf9bce4b) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-0d81bf5b-5d8b-497d-90cd-314cbf9bce4b) |
| Disney+ | Turning Red | [Play](https://www.disneyplus.com/play/2197b4d6-969e-4491-82c8-fde67341404c) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-2197b4d6-969e-4491-82c8-fde67341404c) |
| Disney+ | Up | [Play](https://www.disneyplus.com/play/f820c0a3-e646-4b75-8dd1-87f6d776c32b) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-f820c0a3-e646-4b75-8dd1-87f6d776c32b) |
| Disney+ | WALL-E | [Play](https://www.disneyplus.com/play/280395a4-d5ef-4dd0-bd09-d91c31593d3d) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-280395a4-d5ef-4dd0-bd09-d91c31593d3d) |
| Disney+ | Winnie the Pooh | [Play](https://www.disneyplus.com/play/12f24f7f-e650-4fa2-93ff-50e339c56b22) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-12f24f7f-e650-4fa2-93ff-50e339c56b22) |
| Disney+ | Wreck-It Ralph | [Play](https://www.disneyplus.com/play/0cde80b0-5085-447b-b65e-c81a713a90f0) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-0cde80b0-5085-447b-b65e-c81a713a90f0) |
| Disney+ | Zootopia | [Play](https://www.disneyplus.com/play/ee6e9e33-4b25-443f-8431-9c6eeeca0dc2) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-ee6e9e33-4b25-443f-8431-9c6eeeca0dc2) |
| Disney+ | Zootopia 2 | [Play](https://www.disneyplus.com/play/8f08a8df-8b2f-49e1-9130-1e842b90f185) | Movie / short film | [Provider](https://www.disneyplus.com/browse/entity-8f08a8df-8b2f-49e1-9130-1e842b90f185) |
| Hulu | Adventure Time | [Play](https://www.hulu.com/watch/c7e6e40a-23ca-49ed-a560-56940cc3ce98) | Slumber Party Panic | [Provider](https://www.hulu.com/series/adventure-time-699df5c5-3fd5-4021-a344-a60b42483d0d) |
| Hulu | Animaniacs | [Play](https://www.hulu.com/watch/d1b7f7df-c41e-482d-beca-bf89289f22de) | Episode 1 | [Provider](https://www.hulu.com/series/animaniacs-b072680d-5485-4adf-87ac-4805c0e96bee) |
| Hulu | Batwheels | [Play](https://www.hulu.com/watch/a8b5c525-edda-4d39-9cbe-4107ef395f3c) | Secret Origin of the Batwheels | [Provider](https://www.hulu.com/series/batwheels-c15b1025-fd30-41c3-af60-6cc3637f0bab) |
| Hulu | BUNK'D | [Play](https://www.hulu.com/watch/b0c0f8e5-f6fa-4948-a112-6b53e85e4a25) | Welcome to Camp Kikiwaka | [Provider](https://www.hulu.com/series/bunkd-139507fa-07d2-43ca-8991-370d5306989d) |
| Hulu | Chowder | [Play](https://www.hulu.com/watch/4af2a516-92b2-4f45-b2de-bff00d844b7e) | Burple Nurples / Shnitzel Makes a Deposit | [Provider](https://www.hulu.com/series/chowder-5c5f6041-ff38-4670-a7f8-30033a28f4bc) |
| Hulu | Clarence | [Play](https://www.hulu.com/watch/aa8780cc-a9e0-4904-92ee-65d199098236) | Fun Dungeon Face Off | [Provider](https://www.hulu.com/series/clarence-150d3eaa-f3d5-4c21-b7f9-e8ba358a8680) |
| Hulu | Craig of the Creek | [Play](https://www.hulu.com/watch/fe409041-a860-4871-bf6a-b8a6ff8b395f) | Itch To Explore | [Provider](https://www.hulu.com/series/craig-of-the-creek-5b555370-9953-4691-99b8-f583a854f59a) |
| Hulu | Curious George | [Play](https://www.hulu.com/watch/36c3a72f-c33b-4bbd-abcc-d68aa6d9d747) | Curious George Flies a Kite / From Scratch | [Provider](https://www.hulu.com/series/curious-george-29a4727e-6ac4-4b99-9e91-08c8d872c733) |
| Hulu | Digimon Adventure | [Play](https://www.hulu.com/watch/2bb82f31-9e9a-4bdd-9944-e9e9dea54fd3) | And So It Begins... | [Provider](https://www.hulu.com/series/digimon-adventure-0048dd25-d457-4539-841e-d5ac60154c91) |
| Hulu | Dragons: The Nine Realms | [Play](https://www.hulu.com/watch/4061fa71-b4b7-473c-b660-d9f4b03ec5b2) | First Flight: Part 1 | [Provider](https://www.hulu.com/series/dragons-the-nine-realms-e3436dee-8d2d-43dc-b810-c75d77730fa9) |
| Hulu | Fancy Nancy | [Play](https://www.hulu.com/watch/cb783260-8f7a-4ba7-b175-21e3632d80d2) | Tea Party Trouble / Bonjour Butterfly | [Provider](https://www.hulu.com/series/fancy-nancy-4f528e9e-2c27-4b86-8fae-43e5d8c182de) |
| Hulu | Firebuds | [Play](https://www.hulu.com/watch/862b6f3b-e2cc-4003-9376-3d8bfc8d8ded) | Car in a Tree; Dalmatian Day | [Provider](https://www.hulu.com/series/firebuds-22afcb26-e1ac-4f99-b736-48dc0b76ba58) |
| Hulu | Justice League | [Play](https://www.hulu.com/watch/450cabdc-8079-4b31-a405-d4436745a33f) | Secret Origins Part 1 | [Provider](https://www.hulu.com/series/justice-league-edd14f78-9505-481d-8dcb-851af07c41cf) |
| Hulu | Kiff | [Play](https://www.hulu.com/watch/82260880-1539-4487-a5db-cf10d4951081) | Thirst to be the First / The Fourth Bath | [Provider](https://www.hulu.com/series/kiff-38174b44-5f8f-441e-b21b-9bf7f0b596c2) |
| Hulu | Madagascar: A Little Wild | [Play](https://www.hulu.com/watch/668113f4-81d0-4286-9e5e-67daefa263b7) | The Bear Necessities | [Provider](https://www.hulu.com/series/madagascar-a-little-wild-7a11e023-5762-4980-bfce-7f337e4c28ef) |
| Hulu | Marvel's Spidey and His Amazing Friends | [Play](https://www.hulu.com/watch/f1a4f05e-6c11-4c90-8df2-0b20fda41183) | Spidey to the Power of Three; Panther Patience | [Provider](https://www.hulu.com/series/marvels-spidey-and-his-amazing-friends-cc992c16-e126-4a2b-a039-0b1e7106b727) |
| Hulu | Regular Show | [Play](https://www.hulu.com/watch/e024055c-03dd-41a9-94ff-6e4fa9aeb877) | The Power | [Provider](https://www.hulu.com/series/regular-show-5d6e2ee4-544b-4901-9cc1-482fed801b19) |
| Hulu | Sabrina: The Teenage Witch | [Play](https://www.hulu.com/watch/ff85812f-4e5b-4844-8c03-fefb1add0877) | Pilot | [Provider](https://www.hulu.com/series/sabrina-the-teenage-witch-502bbc34-fa19-48fb-89c6-074da28335d3) |
| Hulu | Sofia the First | [Play](https://www.hulu.com/watch/4975023f-3a1e-49ff-ac5d-4ad7d0091210) | Just One of the Princes | [Provider](https://www.hulu.com/series/sofia-the-first-bc455c45-a11d-43fe-ac7d-3afdfc264909) |
| Hulu | Steven Universe | [Play](https://www.hulu.com/watch/97c9e03f-9999-403b-8e21-8be8fce39540) | Gem Glow | [Provider](https://www.hulu.com/series/steven-universe-73e1e605-f760-470c-9a58-0148abe73270) |
| Hulu | Steven Universe: Future | [Play](https://www.hulu.com/watch/b98f23d1-9de8-4c9e-ad7c-b88c3e5e3750) | Little Homeschool | [Provider](https://www.hulu.com/series/steven-universe-future-d34abd40-985e-4a6d-9391-80a413fd1de0) |
| Hulu | SuperKitties | [Play](https://www.hulu.com/watch/b1461e9a-3252-434a-bbe0-e6455e19e644) | The Great Yarn Caper; Get the Boot | [Provider](https://www.hulu.com/series/superkitties-d488cfed-d102-494b-a384-f6bf64467e32) |
| Hulu | Teen Titans Go! | [Play](https://www.hulu.com/watch/32db6f40-f526-4044-b87f-97a763c6a094) | Legendary Sandwich / Pie Bros | [Provider](https://www.hulu.com/series/teen-titans-go-4792c643-984d-44a7-ba4a-413e3ecbcac0) |
| Hulu | That's So Raven | [Play](https://www.hulu.com/watch/549da7df-525c-4c20-b91a-7e18360e8242) | Mother Dearest | [Provider](https://www.hulu.com/series/thats-so-raven-86bb14fa-2040-4b25-b53f-732da4657de3) |
| Hulu | The Amazing World of Gumball | [Play](https://www.hulu.com/watch/fb98b454-4c35-413b-b409-89622fea9b3a) | The Third / The Debt | [Provider](https://www.hulu.com/series/the-amazing-world-of-gumball-c8b9c799-b81e-4522-a05b-40212f69e7a6) |
| Hulu | The Bravest Knight | [Play](https://www.hulu.com/watch/23ad52ca-6d22-45b6-ac41-f168451e143c) | Cedric & the Troll | [Provider](https://www.hulu.com/series/132eacec-fbd0-4bb0-81a4-8e3cfe3ce662) |
| Hulu | The Croods: Family Tree | [Play](https://www.hulu.com/watch/655b8617-7cb0-4a4b-a17d-382538eb1659) | Sticky Business | [Provider](https://www.hulu.com/series/the-croods-family-tree-ad7f22bd-633d-452d-88b0-a87f26923a79) |
| Hulu | The Jetsons | [Play](https://www.hulu.com/watch/c6f031b4-997f-4e54-bac9-0e11aa42558f) | Rosey the Robot | [Provider](https://www.hulu.com/series/the-jetsons-7e751bd7-a2ef-4ea5-a6fb-d2ca8fbe7073) |
| Hulu | The Marvelous Misadventures of Flapjack | [Play](https://www.hulu.com/watch/20ecfae3-59fd-4e1a-8130-6e3fb2984028) | Several Leagues Under the Sea / Cammie Island | [Provider](https://www.hulu.com/series/the-marvelous-misadventures-of-flapjack-1f3d8887-5dbd-4a54-be49-a12fefe32165) |
| Hulu | The Powerpuff Girls (2016) | [Play](https://www.hulu.com/watch/86f128c3-7144-44b2-b562-b2cbfc68d545) | Escape From Monster Island | [Provider](https://www.hulu.com/series/the-powerpuff-girls-2016-99bf7a88-78a7-478a-abea-db87ecffafdd) |
| Hulu | The Wonderfully Weird World of Gumball | [Play](https://www.hulu.com/watch/69b0340c-c3d8-434d-bfec-bff92f733156) | The Burger | [Provider](https://www.hulu.com/series/the-wonderfully-weird-world-of-gumball-91de62df-0394-4e17-85a8-e843bd730ede) |
| Hulu | ThunderCats (1985) | [Play](https://www.hulu.com/watch/826d0067-7f4e-4396-8e7b-a4d2fa6bb5f7) | Exodus | [Provider](https://www.hulu.com/series/thundercats-1985-1a16953a-f763-49fe-bb80-d40bfb015c06) |
| Hulu | ThunderCats (2011) | [Play](https://www.hulu.com/watch/400ac53c-809a-4bc8-b5b0-c3bd9bb31ad0) | Omens, Part 1 | [Provider](https://www.hulu.com/series/thundercats-2011-8d87f360-808a-4bec-8f66-0735cbcfd322) |
| Hulu | Tiny Toons Looniversity | [Play](https://www.hulu.com/watch/e7bb33a0-6be2-45ad-a773-a5ae505f6101) | Freshman Orientoontion | [Provider](https://www.hulu.com/series/tiny-toons-looniversity-895fc873-99bd-44de-9e63-40e16f50468c) |
| Hulu | Total Dramarama | [Play](https://www.hulu.com/watch/bb04fd57-ca67-4165-8b1b-f981eb3d5ac2) | Robo Teacher | [Provider](https://www.hulu.com/series/total-dramarama-be101f32-3393-4ace-b064-1098a681e91d) |
| Hulu | We Bare Bears | [Play](https://www.hulu.com/watch/8d67b7ab-abe5-486e-ab89-6980a88ac7f8) | Our Stuff | [Provider](https://www.hulu.com/series/we-bare-bears-efdf6607-7332-4a8c-befe-0fdfbbe8f8e1) |
| Hulu | Yu-Gi-Oh! | [Play](https://www.hulu.com/watch/a7a2805c-7d67-4cdc-86b3-721c11f85a73) | (Dub) The Heart of the Cards | [Provider](https://www.hulu.com/series/yu-gi-oh-7202b737-f575-4c3c-b89a-2f6f641a9f16) |
| Netflix | A Boy Called Christmas | [Play](https://www.netflix.com/watch/81029733) | Movie / short film | [Provider](https://www.netflix.com/title/81029733) |
| Netflix | A Christmas Prince | [Play](https://www.netflix.com/watch/80160759) | Movie / short film | [Provider](https://www.netflix.com/title/80160759) |
| Netflix | Back to the Outback | [Play](https://www.netflix.com/watch/81002813) | Movie / short film | [Provider](https://www.netflix.com/title/81002813) |
| Netflix | Benji | [Play](https://www.netflix.com/watch/80204923) | Movie / short film | [Provider](https://www.netflix.com/title/80204923) |
| Netflix | Carmen Sandiego | [Play](https://www.netflix.com/watch/81022977) | Becoming Carmen Sandiego: Part I | [Provider](https://www.netflix.com/title/80167821) |
| Netflix | Chicken Run: Dawn of the Nugget | [Play](https://www.netflix.com/watch/81223025) | Movie / short film | [Provider](https://www.netflix.com/title/81223025) |
| Netflix | Christmas Inheritance | [Play](https://www.netflix.com/watch/80177441) | Movie / short film | [Provider](https://www.netflix.com/title/80177441) |
| Netflix | Dog Gone | [Play](https://www.netflix.com/watch/81155175) | Movie / short film | [Provider](https://www.netflix.com/title/81155175) |
| Netflix | Double Dad | [Play](https://www.netflix.com/watch/81175170) | Movie / short film | [Provider](https://www.netflix.com/title/81175170) |
| Netflix | Family Switch | [Play](https://www.netflix.com/watch/81305096) | Movie / short film | [Provider](https://www.netflix.com/title/81305096) |
| Netflix | Feel the Beat | [Play](https://www.netflix.com/watch/80994878) | Movie / short film | [Provider](https://www.netflix.com/title/80994878) |
| Netflix | Go Karts | [Play](https://www.netflix.com/watch/80241136) | Movie / short film | [Provider](https://www.netflix.com/title/80241136) |
| Netflix | Hilda | [Play](https://www.netflix.com/watch/80117561) | Chapter 1: The Hidden People | [Provider](https://www.netflix.com/title/80115346) |
| Netflix | In Your Dreams | [Play](https://www.netflix.com/watch/80992977) | Movie / short film | [Provider](https://www.netflix.com/title/80992977) |
| Netflix | Klaus | [Play](https://www.netflix.com/watch/80183187) | Movie / short film | [Provider](https://www.netflix.com/title/80183187) |
| Netflix | Leo | [Play](https://www.netflix.com/watch/81218917) | Movie / short film | [Provider](https://www.netflix.com/title/81218917) |
| Netflix | Mixtape | [Play](https://www.netflix.com/watch/80994277) | Movie / short film | [Provider](https://www.netflix.com/title/80994277) |
| Netflix | My Little Pony: A New Generation | [Play](https://www.netflix.com/watch/81424207) | Movie / short film | [Provider](https://www.netflix.com/title/81424207) |
| Netflix | Nimona | [Play](https://www.netflix.com/watch/81444554) | Movie / short film | [Provider](https://www.netflix.com/title/81444554) |
| Netflix | Orion and the Dark | [Play](https://www.netflix.com/watch/81476885) | Movie / short film | [Provider](https://www.netflix.com/title/81476885) |
| Netflix | Over the Moon | [Play](https://www.netflix.com/watch/80214236) | Movie / short film | [Provider](https://www.netflix.com/title/80214236) |
| Netflix | Puffin Rock | [Play](https://www.netflix.com/watch/80058329) | Puffin Practice / The Mystery Egg / To See the Moon | [Provider](https://www.netflix.com/title/80044965) |
| Netflix | Rescued by Ruby | [Play](https://www.netflix.com/watch/81107362) | Movie / short film | [Provider](https://www.netflix.com/title/81107362) |
| Netflix | Roald Dahl's Matilda The Musical | [Play](https://www.netflix.com/watch/80993016) | Movie / short film | [Provider](https://www.netflix.com/title/80993016) |
| Netflix | Secret Magic Control Agency | [Play](https://www.netflix.com/watch/81267965) | Movie / short film | [Provider](https://www.netflix.com/title/81267965) |
| Netflix | Shaun the Sheep: The Flight Before Christmas | [Play](https://www.netflix.com/watch/81193166) | Movie / short film | [Provider](https://www.netflix.com/title/81193166) |
| Netflix | Skater Girl | [Play](https://www.netflix.com/watch/81283585) | Movie / short film | [Provider](https://www.netflix.com/title/81283585) |
| Netflix | Spellbound | [Play](https://www.netflix.com/watch/81745658) | Movie / short film | [Provider](https://www.netflix.com/title/81745658) |
| Netflix | Spy Kids: Armageddon | [Play](https://www.netflix.com/watch/81588091) | Movie / short film | [Provider](https://www.netflix.com/title/81588091) |
| Netflix | That Christmas | [Play](https://www.netflix.com/watch/81309564) | Movie / short film | [Provider](https://www.netflix.com/title/81309564) |
| Netflix | The Christmas Chronicles | [Play](https://www.netflix.com/watch/80199682) | Movie / short film | [Provider](https://www.netflix.com/title/80199682) |
| Netflix | The Christmas Chronicles: Part Two | [Play](https://www.netflix.com/watch/80988988) | Movie / short film | [Provider](https://www.netflix.com/title/80988988) |
| Netflix | The Loud House Movie | [Play](https://www.netflix.com/watch/81068804) | Movie / short film | [Provider](https://www.netflix.com/title/81068804) |
| Netflix | The Mitchells vs. The Machines | [Play](https://www.netflix.com/watch/81399614) | Movie / short film | [Provider](https://www.netflix.com/title/81399614) |
| Netflix | The Monkey King | [Play](https://www.netflix.com/watch/80237245) | Movie / short film | [Provider](https://www.netflix.com/title/80237245) |
| Netflix | The Princess Switch | [Play](https://www.netflix.com/watch/80242926) | Movie / short film | [Provider](https://www.netflix.com/title/80242926) |
| Netflix | The Sea Beast | [Play](https://www.netflix.com/watch/81018682) | Movie / short film | [Provider](https://www.netflix.com/title/81018682) |
| Netflix | The Sleepover | [Play](https://www.netflix.com/watch/80238399) | Movie / short film | [Provider](https://www.netflix.com/title/80238399) |
| Netflix | The Snow Sister | [Play](https://www.netflix.com/watch/81681292) | Movie / short film | [Provider](https://www.netflix.com/title/81681292) |
| Netflix | The Water Man | [Play](https://www.netflix.com/watch/81427442) | Movie / short film | [Provider](https://www.netflix.com/title/81427442) |
| Netflix | The Willoughbys | [Play](https://www.netflix.com/watch/80239482) | Movie / short film | [Provider](https://www.netflix.com/title/80239482) |
| Netflix | Thelma the Unicorn | [Play](https://www.netflix.com/watch/81110501) | Movie / short film | [Provider](https://www.netflix.com/title/81110501) |
| Netflix | Trollhunters: Rise of the Titans | [Play](https://www.netflix.com/watch/81010139) | Movie / short film | [Provider](https://www.netflix.com/title/81010139) |
| Netflix | True Spirit | [Play](https://www.netflix.com/watch/81054619) | Movie / short film | [Provider](https://www.netflix.com/title/81054619) |
| Netflix | Vivo | [Play](https://www.netflix.com/watch/81199052) | Movie / short film | [Provider](https://www.netflix.com/title/81199052) |
| Netflix | Wallace & Gromit: Vengeance Most Fowl | [Play](https://www.netflix.com/watch/81351936) | Movie / short film | [Provider](https://www.netflix.com/title/81351936) |
| Netflix | We Can Be Heroes | [Play](https://www.netflix.com/watch/80994666) | Movie / short film | [Provider](https://www.netflix.com/title/80994666) |
| Netflix | Wish Dragon | [Play](https://www.netflix.com/watch/81153694) | Movie / short film | [Provider](https://www.netflix.com/title/81153694) |
| Netflix | Woody Woodpecker Goes to Camp | [Play](https://www.netflix.com/watch/81215996) | Movie / short film | [Provider](https://www.netflix.com/title/81215996) |
| Netflix | YES DAY | [Play](https://www.netflix.com/watch/81011712) | Movie / short film | [Provider](https://www.netflix.com/title/81011712) |
| Prime Video | All Creatures Big and Small | [Play](https://www.primevideo.com/region/na/detail/0HZHB5XJOJ4QS49GS1JQT07H6A?autoplay=1) | Movie / short film | [Provider](https://www.primevideo.com/detail/0HZHB5XJOJ4QS49GS1JQT07H6A) |
| Prime Video | Hotel Transylvania: Transformania | [Play](https://www.primevideo.com/region/na/detail/0ILGJ4D4ZYPGJCCG2VNGX3LCR3?autoplay=1) | Movie / short film | [Provider](https://www.primevideo.com/detail/0ILGJ4D4ZYPGJCCG2VNGX3LCR3) |
| Prime Video | Just Add Magic | [Play](https://www.primevideo.com/region/na/detail/0SGFS803Y5N6USNC5ZEP7RERMK?autoplay=1) | 1. Just Add Magic | [Provider](https://www.primevideo.com/detail/0JT9QJ3BTFIO33XC836JB6XJIV) |
| Prime Video | Lost in Oz | [Play](https://www.primevideo.com/region/na/detail/0KRETSN38NDWSGBRWON79MZKF7?autoplay=1) | Season 1 Behind the Scenes | [Provider](https://www.primevideo.com/detail/0L7FAB2L81E4FVEIZOQ2BX54S4) |
| Prime Video | Maya The Bee | [Play](https://www.primevideo.com/region/na/detail/0PLOVHXBJJ2U3EEF2BW02YGYGJ?autoplay=1) | Movie / short film | [Provider](https://www.primevideo.com/detail/0PLOVHXBJJ2U3EEF2BW02YGYGJ) |
| Prime Video | Pete the Cat | [Play](https://www.primevideo.com/region/na/detail/0H76F0NN2X42VRVBXC8CGIOX14?autoplay=1) | 1. Too Cool for School & Pete at the Beach | [Provider](https://www.primevideo.com/detail/0U9RX7MIAHZEG129T84ZWLN4VL) |
| Prime Video | Red Shoes and the Seven Dwarfs | [Play](https://www.primevideo.com/region/na/detail/0JF5T4HL3QRL0KZG2KSH2GJDAP?autoplay=1) | Movie / short film | [Provider](https://www.primevideo.com/detail/0JF5T4HL3QRL0KZG2KSH2GJDAP) |
| Prime Video | Rock Dog | [Play](https://www.primevideo.com/region/na/detail/0SH3T8TL5Y6BRPVKSO2XW5IID6?autoplay=1) | Movie / short film | [Provider](https://www.primevideo.com/detail/0SH3T8TL5Y6BRPVKSO2XW5IID6) |
| Prime Video | Sing 2 | [Play](https://www.primevideo.com/region/na/detail/0K04DMLEJSTE354379LLPZ9ZAN?autoplay=1) | Movie / short film | [Provider](https://www.primevideo.com/detail/0K04DMLEJSTE354379LLPZ9ZAN) |
| Prime Video | The Stinky & Dirty Show | [Play](https://www.primevideo.com/region/na/detail/0RMLVSAA62L6TFTYWGJBOD8FW0?autoplay=1) | 1. Jump at the Dump / Road Block | [Provider](https://www.primevideo.com/detail/0U44E08N4F3GMFVIDRHREE3UU7) |
| Prime Video | Troop Zero | [Play](https://www.primevideo.com/region/na/detail/0SGK6OBXIGXMLRK2OP7QXOAVZ2?autoplay=1) | Movie / short film | [Provider](https://www.primevideo.com/detail/0SGK6OBXIGXMLRK2OP7QXOAVZ2) |
| Prime Video | Tumble Leaf | [Play](https://www.primevideo.com/region/na/detail/0SAPL02FCQSNUOZ7R57982Y9LH?autoplay=1) | 10. Fig's Speedy Sled; Parachute Play | [Provider](https://www.primevideo.com/detail/0JSOQNXC38YDDVGBXDDTIMFZS7) |
| Tubi | A Turtle's Tale: Sammy's Adventures | [Play](https://tubitv.com/movies/372440/a-turtle-s-tale-sammy-s-adventures) | Movie / short film | [Provider](https://tubitv.com/movies/372440/a-turtle-s-tale-sammy-s-adventures) |
| Tubi | All Dogs Go to Heaven | [Play](https://tubitv.com/movies/300445/all-dogs-go-to-heaven) | Movie / short film | [Provider](https://tubitv.com/movies/300445/all-dogs-go-to-heaven) |
| Tubi | All Dogs Go To Heaven 2 | [Play](https://tubitv.com/movies/312167/all-dogs-go-to-heaven-2) | Movie / short film | [Provider](https://tubitv.com/movies/312167/all-dogs-go-to-heaven-2) |
| Tubi | Animaniacs | [Play](https://tubitv.com/tv-shows/200303488/s01-e01-de-zanitized-the-monkey-song-nighty-night-toons) | S01:E01 - De-Zanitized/The Monkey Song/Nighty Night Toons | [Provider](https://tubitv.com/series/300019067/animaniacs) |
| Tubi | Barney & Friends | [Play](https://tubitv.com/tv-shows/587555/s07-e701-all-aboard) | S07:E701 - All Aboard | [Provider](https://tubitv.com/series/300006778/barney-friends) |
| Tubi | Clifford | [Play](https://tubitv.com/tv-shows/200133788/s01-e01-my-best-friend-cleo-s-fair-share) | S01:E01 - My Best Friend / Cleo's Fair Share | [Provider](https://tubitv.com/series/300013071/clifford) |
| Tubi | Clifford's Puppy Days | [Play](https://tubitv.com/tv-shows/200136501/s01-e01-socks-and-snooze-keeping-cool) | S01:E01 - Socks and Snooze / Keeping Cool | [Provider](https://tubitv.com/series/300013166/clifford-s-puppy-days) |
| Tubi | Courage the Cowardly Dog | [Play](https://tubitv.com/tv-shows/200303849/s01-e01-a-night-at-the-katz-motel-cajun-granny-stew) | S01:E01 - A Night at the Katz Motel/Cajun Granny Stew | [Provider](https://tubitv.com/series/300019075/courage-the-cowardly-dog) |
| Tubi | Dennis the Menace | [Play](https://tubitv.com/tv-shows/235461/s01-e01-dennis-goes-to-the-movies) | S01:E01 - Dennis Goes to the Movies | [Provider](https://tubitv.com/series/303/dennis-the-menace) |
| Tubi | Dexter's Laboratory | [Play](https://tubitv.com/tv-shows/200304727/s01-e01-dee-deemensional-magmanamus-maternal-combat) | S01:E01 - Dee Deemensional / Magmanamus / Maternal Combat | [Provider](https://tubitv.com/series/300019090/dexter-s-laboratory) |
| Tubi | Dragon Tales | [Play](https://tubitv.com/tv-shows/200367468/s01-e01-to-fly-with-dragons-the-forest-of-darkness) | S01:E01 - To Fly With Dragons & The Forest of Darkness | [Provider](https://tubitv.com/series/300021614/dragon-tales) |
| Tubi | Ed, Edd n Eddy | [Play](https://tubitv.com/tv-shows/200304938/s01-e01-the-ed-touchables-nagged-to-ed) | S01:E01 - The Ed-Touchables / Nagged to Ed | [Provider](https://tubitv.com/series/300019095/ed-edd-n-eddy) |
| Tubi | Ernest's Greatest Hits: Volume 1 | [Play](https://tubitv.com/movies/449509/ernest-s-greatest-hits-volume-1) | Movie / short film | [Provider](https://tubitv.com/movies/449509/ernest-s-greatest-hits-volume-1) |
| Tubi | Fluke | [Play](https://tubitv.com/movies/306932/fluke) | Movie / short film | [Provider](https://tubitv.com/movies/306932/fluke) |
| Tubi | Fly Away Home | [Play](https://tubitv.com/movies/100047049/fly-away-home) | Movie / short film | [Provider](https://tubitv.com/movies/100047049/fly-away-home) |
| Tubi | Franklin and the Turtle Lake Treasure | [Play](https://tubitv.com/movies/313748/franklin-and-the-turtle-lake-treasure) | Movie / short film | [Provider](https://tubitv.com/movies/313748/franklin-and-the-turtle-lake-treasure) |
| Tubi | Franklin Back to School Special | [Play](https://tubitv.com/movies/313749/franklin-back-to-school-special) | Movie / short film | [Provider](https://tubitv.com/movies/313749/franklin-back-to-school-special) |
| Tubi | Labyrinth | [Play](https://tubitv.com/movies/100021024/labyrinth) | Movie / short film | [Provider](https://tubitv.com/movies/100021024/labyrinth) |
| Tubi | Looney Tunes | [Play](https://tubitv.com/tv-shows/200230879/s01-e01-whizzard-of-ow-my-generation-g-g-gap-cock-a-doodle-duel-museum-scream-duck-dodgers-in-attack-of-the-drones) | S01:E01 - Whizzard of Ow / My Generation G…G…Gap / Cock-a-Doodle-Duel / Museum Scream / Duck Dodgers in Attack of the Drones | [Provider](https://tubitv.com/series/300016553/looney-tunes) |
| Tubi | Mighty Morphin Power Rangers | [Play](https://tubitv.com/tv-shows/200165482/s01-e01-day-of-the-dumpster) | S01:E01 - Day of the Dumpster | [Provider](https://tubitv.com/series/300014189/mighty-morphin-power-rangers) |
| Tubi | Pokémon the Movie: Diancie and the Cocoon of Destruction | [Play](https://tubitv.com/movies/100045338/pok-mon-the-movie-diancie-and-the-cocoon-of-destruction) | Movie / short film | [Provider](https://tubitv.com/movies/100045338/pok-mon-the-movie-diancie-and-the-cocoon-of-destruction) |
| Tubi | Pokémon the Movie: Hoopa and the Clash of Ages | [Play](https://tubitv.com/movies/100045341/pok-mon-the-movie-hoopa-and-the-clash-of-ages) | Movie / short film | [Provider](https://tubitv.com/movies/100045341/pok-mon-the-movie-hoopa-and-the-clash-of-ages) |
| Tubi | Pokémon the Movie: Volcanion and the Mechanical Marvel | [Play](https://tubitv.com/movies/100045342/pok-mon-the-movie-volcanion-and-the-mechanical-marvel) | Movie / short film | [Provider](https://tubitv.com/movies/100045342/pok-mon-the-movie-volcanion-and-the-mechanical-marvel) |
| Tubi | Sabrina the Teenage Witch | [Play](https://tubitv.com/movies/686298/sabrina-the-teenage-witch) | Movie / short film | [Provider](https://tubitv.com/movies/686298/sabrina-the-teenage-witch) |
| Tubi | Short Circuit 2 | [Play](https://tubitv.com/movies/100014726/short-circuit-2) | Movie / short film | [Provider](https://tubitv.com/movies/100014726/short-circuit-2) |
| Tubi | The Cat in the Hat Knows a Lot About That! | [Play](https://tubitv.com/tv-shows/642071/s03-e01-building-bridges-float-your-boat) | S03:E01 - Building Bridges / Float Your Boat | [Provider](https://tubitv.com/series/300007148/the-cat-in-the-hat-knows-a-lot-about-that) |
| Tubi | The Dark Crystal | [Play](https://tubitv.com/movies/100021025/the-dark-crystal) | Movie / short film | [Provider](https://tubitv.com/movies/100021025/the-dark-crystal) |
| Tubi | The Flintstones | [Play](https://tubitv.com/tv-shows/596023/s01-e01-the-flinstone-flyer) | S01:E01 - The Flinstone Flyer | [Provider](https://tubitv.com/series/300006856/the-flintstones) |
| Tubi | The Great Bear | [Play](https://tubitv.com/movies/466198/the-great-bear) | Movie / short film | [Provider](https://tubitv.com/movies/466198/the-great-bear) |
| Tubi | The Looney Tunes Show | [Play](https://tubitv.com/tv-shows/200189372/s01-e01-best-friends) | S01:E01 - Best Friends | [Provider](https://tubitv.com/series/300015103/the-looney-tunes-show) |
| Tubi | The Magic School Bus | [Play](https://tubitv.com/tv-shows/652421/s01-e01-gets-lost-in-space) | S01:E01 - Gets Lost in Space | [Provider](https://tubitv.com/series/300008495/the-magic-school-bus) |
| Tubi | The Music Man | [Play](https://tubitv.com/movies/100012574/the-music-man) | Movie / short film | [Provider](https://tubitv.com/movies/100012574/the-music-man) |
| Tubi | The Powerpuff Girls | [Play](https://tubitv.com/tv-shows/200304808/s01-e01-monkey-see-doggie-do-mommy-fearest) | S01:E01 - Monkey See, Doggie Do / Mommy Fearest | [Provider](https://tubitv.com/series/300019078/the-powerpuff-girls) |
| Tubi | The Secret of NIMH | [Play](https://tubitv.com/movies/310149/the-secret-of-nimh) | Movie / short film | [Provider](https://tubitv.com/movies/310149/the-secret-of-nimh) |
| Tubi | Timmy Time | [Play](https://tubitv.com/tv-shows/200087105/s01-e01-episode-1) | S01:E01 - Episode 1 | [Provider](https://tubitv.com/series/300010497/timmy-time) |
| Tubi | Transformers: Generation 1 | [Play](https://tubitv.com/tv-shows/111770/s01-e01-more-than-meets-the-eye-pt-1) | S01:E01 - More Than Meets The Eye (Pt. 1) | [Provider](https://tubitv.com/series/11/transformers-generation-1) |
| Tubi | Where the Red Fern Grows (Pt. 1) | [Play](https://tubitv.com/movies/465998/where-the-red-fern-grows-pt-1) | Movie / short film | [Provider](https://tubitv.com/movies/465998/where-the-red-fern-grows-pt-1) |
| YouTube | Big Buck Bunny | [Play](https://www.youtube.com/watch?v=aqz-KE-bpKQ) | Movie / short film | [Provider](https://www.youtube.com/watch?v=aqz-KE-bpKQ) |
| YouTube | Caminandes 3: Llamigos | [Play](https://www.youtube.com/watch?v=SkVqJ1SGeL0) | Movie / short film | [Provider](https://www.youtube.com/watch?v=SkVqJ1SGeL0) |
| YouTube | Coffee Run | [Play](https://www.youtube.com/watch?v=PVGeM40dABA) | Movie / short film | [Provider](https://www.youtube.com/watch?v=PVGeM40dABA) |
| YouTube | Glass Half | [Play](https://www.youtube.com/watch?v=lqiN98z6Dak) | Movie / short film | [Provider](https://www.youtube.com/watch?v=lqiN98z6Dak) |
| YouTube | Spring | [Play](https://www.youtube.com/watch?v=WhWc3b3KhnY) | Movie / short film | [Provider](https://www.youtube.com/watch?v=WhWc3b3KhnY) |
| YouTube | Wing It! | [Play](https://www.youtube.com/watch?v=u9lj-c29dxI) | Movie / short film | [Provider](https://www.youtube.com/watch?v=u9lj-c29dxI) |
