import totalInfoOne from "../assets/dashboards/total_info_one.png";
import totalInfoTwo from "../assets/dashboards/total_info_two.png";
import totalInfoThree from "../assets/dashboards/total_info_three.png";
import totalInfoFour from "../assets/dashboards/total_info_four.png";
import totalInfoFive from "../assets/dashboards/total_info_five.png";
import totalInfoSix from "../assets/dashboards/total_info_six.png";
import totalInfoSeven from "../assets/dashboards/total_info_seven.png";
import totalInfoEight from "../assets/dashboards/total_info_eight.png";

/** Dashboard summary tile icons from Figma (`assets/dashboards/total_info_*`). */
export type MetricIconId =
	| "one"
	| "two"
	| "three"
	| "four"
	| "five"
	| "six"
	| "seven"
	| "eight";

export const METRIC_ICONS: Record<MetricIconId, string> = {
	one: totalInfoOne,
	two: totalInfoTwo,
	three: totalInfoThree,
	four: totalInfoFour,
	five: totalInfoFive,
	six: totalInfoSix,
	seven: totalInfoSeven,
	eight: totalInfoEight,
};
