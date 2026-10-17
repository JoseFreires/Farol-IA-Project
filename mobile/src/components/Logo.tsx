import { View } from "react-native";
import Svg, { Circle, Path, Polygon, Rect } from "react-native-svg";

import { cores } from "../theme/tema";

type Props = { size?: number };

// Desenho puramente decorativo: fica escondido dos leitores de tela.
export function Logo({ size = 120 }: Props) {
    return (
        <View
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
        >
            <Svg width={size} height={size} viewBox="0 0 160 160">
                {/* Raios de luz */}
                <Polygon points="80,50 4,22 4,78" fill={cores.luz} opacity={0.26} />
                <Polygon points="80,50 156,22 156,78" fill={cores.luz} opacity={0.26} />
                <Circle cx={80} cy={50} r={17} fill={cores.luz} opacity={0.3} />

                {/* Torre */}
                <Polygon points="64,150 96,150 90,64 70,64" fill={cores.torre} />
                <Polygon points="68.19,90 91.81,90 93.07,108 66.93,108" fill={cores.listra} />
                <Polygon points="65.67,126 94.33,126 95.58,144 64.42,144" fill={cores.listra} />

                {/* Galeria, lanterna e telhado */}
                <Rect x={62} y={60} width={36} height={5} rx={1.5} fill={cores.torre} />
                <Rect x={70} y={40} width={20} height={20} rx={3} fill={cores.luz} />
                <Polygon points="66,40 80,27 94,40" fill={cores.torre} />
                <Circle cx={80} cy={24} r={3} fill={cores.luz} />

                {/* Mar */}
                <Path
                    d="M0 150 Q20 142 40 150 T80 150 T120 150 T160 150 V160 H0 Z"
                    fill={cores.superficie}
                />
            </Svg>
        </View>
    );
}