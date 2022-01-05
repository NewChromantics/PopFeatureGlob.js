//import {CreateBlitQuadGeometry} from '../PopEngine/CommonGeometry.js' 
//=CreateBlitQuadGeometry();
export const BlitGeometry = 
{
	Position:
	{
		Size:	2,
		Data:	[
					0,0,	1,0,	1,1,
					1,1,	0,1,	0,0
				]
	}
};

export const BlitVertShader = `
//precision highp float;
attribute vec2 Position;
varying vec2 FragUv;

void main()
{
	vec2 xy = mix( vec2(-1,-1), vec2(1,1), Position );
	gl_Position = vec4( xy, 0.0, 1.0 );
	FragUv = Position;
}

`;

export const FindFeaturesFrag = `
precision highp float;
varying vec2 FragUv;
void main()
{
	gl_FragColor = vec4(FragUv,0,0.5);
}

`;
