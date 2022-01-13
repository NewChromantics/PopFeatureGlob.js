export const Frag = `
precision highp float;
varying vec2 FragUv;

uniform sampler2D InputTexture;
uniform vec2 InputWidthHeight;

#define DILATE_RADIUS				3
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
	float DistanceToBright = SelfBright ? 0.0 : 99.0;
	
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
			
			float NeighbourDistance = length( vec2(x,y) ); 
			if ( NeighbourBright )
				DistanceToBright = min( DistanceToBright, NeighbourDistance );
		}
	}

	if ( DILATE_RADIUS > 0 )
	{
		float NeighbourBrightf = float(BrightCount) / float(NeighbourCount);
		SelfBright = SelfBright || (NeighbourBrightf>MIN_NEIGHBOUR_BRIGHTNESS);
		if ( BrightCount < MIN_BRIGHT_NEIGHBOURS+1 )
			SelfBright = false;
	}
	
		
	DistanceToBright = DistanceToBright/float(DILATE_RADIUS*1);
	float Score;
	if ( DistanceToBright > 1.0 || !SelfBright )
	{
		Score = 0.0;
	}
	else
	{
		//	set a min value for the output
		float MinScore = 0.0;
		Score = mix( 1.0, MinScore, DistanceToBright );
	}

	gl_FragColor = vec4( Score, Score, Score, 1 );
}

`;
export default Frag;
