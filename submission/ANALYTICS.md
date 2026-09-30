# Benny's Hub usage reports

The website uses the existing GA4 measurement ID `G-N0MEEN7YP4`. Usage tracking covers Hub games and tools opened through the Hub or directly. It records launches and foreground time using fixed catalog identifiers, names and categories. It does not send typed text, journal entries, calendar details, search queries or private media links. Viewing time in the Companion's separate streaming window is not included.

Foreground time estimates how long the relevant Hub screen is visible and the browser window has focus; it is not a measurement of continuous interaction. Analytics blocking, lost connections and abrupt browser shutdowns can cause undercounting. Counts start with this release and cannot recover past untracked activity. Offline periods are not replayed later. Local development and other site origins do not send Analytics events.

Direct-link tracking covers the 31 catalog entry pages. Editors opened inside the Hub continue under their parent game/tool; separate editor pages/windows and external streaming playback are not timed. The **Hub menus** row accounts for time outside a game/tool and has no launch count.

## Register the fields once

In the Benny's Hub property, open **Admin → Data display → Custom definitions**. An Editor or Administrator role is required. Under **Custom dimensions → Create custom dimension**, add these fields with scope **Event**. Type the exact parameter even if it is not yet offered in the dropdown.

| Dimension name | Event parameter |
| --- | --- |
| Hub app ID | `hub_app_id` |
| Hub app name | `hub_app_name` |
| Hub app type | `hub_app_type` |

Under **Custom metrics → Create custom metric**, add:

| Metric name | Event parameter | Unit of measurement |
| --- | --- | --- |
| Hub launches | `hub_launches` | Standard |
| Hub foreground time | `hub_usage_seconds` | Seconds |

These are numeric metrics, not dimensions. Google documents the unit for a count as **Standard**. The time parameter contains seconds, so select **Seconds**. Allow 24–48 hours after sending data and registering the definitions for the fields to become available in reports. See Google's [custom dimension instructions](https://support.google.com/analytics/answer/14239696?hl=en) and [custom metric instructions](https://support.google.com/analytics/answer/14239619?hl=en).

## Make the usage report

Open **Explore → Free form** and name the exploration **Benny's Hub usage**.

1. Under **Variables → Dimensions → +**, import **Hub app name**, **Hub app type**, and **Event name**.
2. Under **Variables → Metrics → +**, import **Total users**, **Hub launches**, and **Hub foreground time**. Custom fields appear in the **Custom** tab.
3. In **Settings**, select the table visualization. Put **Hub app name** in **Rows**, and the three metrics in **Values**.
4. Set the date range to include the release date and later. Sort by **Hub launches** to see the most opened games/tools or **Hub foreground time** to see where people spend time.
5. To restrict the report to usage tracking, add a filter: **Event name → matches regex → `^(hub_app_open|hub_usage)$`**. Both events must remain included so launches and time can appear together. The custom launch/time sums are also valid without this filter; the filter keeps unrelated events out of the user count.

**Total users** estimates distinct users for each row; the same person can appear in multiple app rows, so do not sum those rows to obtain whole-Hub users. **Hub launches** counts openings rather than timing updates. **Hub foreground time** sums the reported duration increments. Google's [free-form guide](https://support.google.com/analytics/answer/9327972?hl=en) describes the table and filter controls.

## Optional averages

In **Admin → Data display → Custom definitions → Calculated metrics → Create calculated metric**, create:

| Name | Formula | Unit |
| --- | --- | --- |
| Hub time per launch | `{Hub foreground time} / {Hub launches}` | Seconds |
| Hub time per user | `{Hub foreground time} / {Total users}` | Seconds |

Choose the registered metric names from the formula suggestions and add the calculated metric to the report's **Values**. These averages apply to the chosen reporting period; time per launch is an aggregate estimate, not a reconstruction of every completed app visit. A visit spanning the date boundary may contribute time without an opening inside that same period.

Do not divide time by **Event count** when both event types are included: timing updates are events too. Do not average the individual duration increments; that measures the typical reporting interval. GA4 custom metrics provide sum, average and count variants; this report uses the **sum**. See [calculated metrics](https://support.google.com/analytics/answer/14166471?hl=en) and [custom metric aggregation](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema#custom_metrics).

## Verify collection

Open the deployed Hub, launch a game/tool, use it briefly, then return to the Hub. Also check a direct game/tool link. In GA4 **Reports → Realtime**, inspect the **Event count by Event name** card for `hub_app_open` and `hub_usage`; select an event to inspect its parameters. This confirms collection before the custom reports have finished processing.

| Event | Parameters specific to the event |
| --- | --- |
| `hub_app_open` | `hub_launches: 1` |
| `hub_usage` | `hub_usage_seconds`: elapsed foreground seconds since the prior update |

Both events identify the screen through `hub_app_id`, `hub_app_name`, and `hub_app_type`. Timing updates contain increments, not a repeatedly resent running total. Event counts alone therefore must not be presented as launch counts.

## Developer validation

Run `npm test` for timer/lifecycle and privacy cases. Run `npm run test:usage` for the real Hub/Keyboard browser flow with all network requests mocked; no test events reach Google Analytics. If Chrome is installed at a nonstandard location, set `HUB_BROWSER_EXECUTABLE` or pass its executable path after `npm run test:usage --`.
