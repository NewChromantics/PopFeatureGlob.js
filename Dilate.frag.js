export const Frag = `
precision highp float;
varying vec2 FragUv;

uniform sampler2D InputTexture;
uniform vec2 InputWidthHeight;

#define DILATE_RADIUS				2
#define MIN_BRIGHT_NEIGHBOURS		2	//	noise filter
#define MIN_NEIGHBOUR_BRIGHTNESS	0.1


bool IsBright(int Offsetx,int Offsety)
{
	vec2 TexelSize = vec2(1,1) / InputWidthHeight;
	vec2 SampleUv = FragUv + vec2(Offsetx,Offsety)*TexelSize;
	vec4 Sample = texture2D( InputTexture, SampleUv );
	return Sample.x > 0.5;
}

void main()
{
	bool SelfBright = IsBright(0,0);
	
	int BrightCount = 0;
	int NeighbourCount = 0;

	//	dilate
	for ( int y=-DILATE_RADIUS;	y<=DILATE_RADIUS;	y++ )
	{
		for ( int x=-DILATE_RADIUS;	x<=DILATE_RADIUS;	x++ )
		{
			if ( x==0 && y==0 )
				continue;
			bool NeighbourBright = IsBright(x,y);
			BrightCount += NeighbourBright ? 1 : 0;
			NeighbourCount++;
		}
	}

	if ( DILATE_RADIUS > 0 )
	{
		float NeighbourBrightf = float(BrightCount) / float(NeighbourCount);
		SelfBright = SelfBright || (NeighbourBrightf>MIN_NEIGHBOUR_BRIGHTNESS);
		if ( BrightCount < MIN_BRIGHT_NEIGHBOURS+1 )
			SelfBright = false;
	}
	
	gl_FragColor = SelfBright ? vec4(1,1,1,1) : vec4(0,0,0,1);
}

`;
export default Frag;
