import FindFeaturesFrag from './GlobFeatures.frag.js';
import DilateFrag from './Dilate.frag.js';
import HighContrastFrag from './HighContrastFilter.frag.js';
import ExtractFeaturesFrag from './ExtractFeatures.frag.js';
export {FindFeaturesFrag,DilateFrag,HighContrastFrag,ExtractFeaturesFrag};

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


/*
export const DebugFeaturesFrag = `
precision highp float;
varying vec2 FragUv;
uniform sampler2D InputTexture;
void main()
{
	vec4 Sample = texture2D( InputTexture, FragUv );
	gl_FragColor = vec4( Sample.xyz, 0.5 );
	
	//	now do feature stuff
	float Grey = (Sample.x+Sample.y+Sample.z)/3.0;
	if ( Grey > 0.55 )
		gl_FragColor = vec4(1,0,1,1);
	else
		gl_FragColor = vec4(0,0,0,0);
	
}

`;
*/

