export const Frag = `
precision highp float;
varying vec2 FragUv;

uniform sampler2D InputTexture;
uniform vec2 InputWidthHeight;
//uniform sampler2D BackgroundImage;

//	width/height of sample area
#define SAMPLE_RADIUS	7
#define SAMPLE_COUNT_WIDTH	SAMPLE_RADIUS
#define SAMPLE_COUNT_HEIGHT	SAMPLE_COUNT_WIDTH

#define SAMPLE_RADIUSf		float(SAMPLE_RADIUS)
#define SAMPLE_COUNT_WIDTHf	float(SAMPLE_COUNT_WIDTH)

#define DILATE_RADIUS	2

float GetLuma(vec4 Rgba)
{
	float Average = (Rgba.x + Rgba.y + Rgba.z) / 3.0;
	return Average;
	return Rgba.x;
}


vec3 NormalToRedGreen(float Normal)
{
	if ( Normal < 0.5 )
	{
		Normal = Normal / 0.5;
		return vec3( 1, Normal, 0 );
	}
	else if ( Normal <= 1.0 )
	{
		Normal = (Normal-0.5) / 0.5;
		return vec3( 1.0-Normal, 1, 0 );
	}
	
	//	>1
	return vec3( 0,0,1 );
}

float Range(float Min,float Max,float Value)
{
	return (Value-Min) / (Max-Min);
}

	#define HISTOGRAM_BIN_COUNT	20

void IncreaseArrayIndexCount(inout int Array[HISTOGRAM_BIN_COUNT],int Index)
{
	for ( int i=0;	i<HISTOGRAM_BIN_COUNT;	i++ )
	{
		if ( i==Index )
			Array[i]++;
	}
	/*
	switch(Index)
	{
		case 0:	Array[0]++;	break;
		case 1:	Array[1]++;	break;
		case 2:	Array[2]++;	break;
		case 3:	Array[3]++;	break;
		case 4:	Array[4]++;	break;
		case 5:	Array[5]++;	break;
		case 6:	Array[6]++;	break;
		case 7:	Array[7]++;	break;
		case 8:	Array[8]++;	break;
		case 9:	Array[9]++;	break;
	}
	*/
}

bool ContainsGreen(vec3 Rgb)
{
	//	todo: get hue angle?
	//	also expects quite bright
	bool Green = Rgb.y > 0.61;
	bool White = max(Rgb.x,Rgb.z) > 0.6;
	//return true; 
	return Green && !White;
}


bool IsBright(int Offsetx,int Offsety)
{
	vec2 TexelSize = vec2(1,1) / InputWidthHeight;
	vec2 CenterUv = FragUv + vec2(Offsetx,Offsety) * TexelSize;
	
	//	histogram bins
	int HistogramBinHits[HISTOGRAM_BIN_COUNT];
	
	//	floats to avoid += 0 scenario
	#define SAMPLE_STEP	((SAMPLE_RADIUSf*2.0)/SAMPLE_COUNT_WIDTHf)
	float MinLuma = 1.0;
	float MaxLuma = 0.0;
	bool GreenNear = false;
	for ( float y=-SAMPLE_RADIUSf;	y<=SAMPLE_RADIUSf;	y+=SAMPLE_STEP )
	{
		for ( float x=-SAMPLE_RADIUSf;	x<=SAMPLE_RADIUSf;	x+=SAMPLE_STEP )
		{
			vec2 uv = CenterUv + (vec2(x,y) * TexelSize);
			vec4 Rgba = texture2D( InputTexture, uv );
			float Luma = GetLuma( Rgba );
			MinLuma = min( MinLuma, Luma );
			MaxLuma = max( MaxLuma, Luma );
			
			int Bin = int( Luma * float(HISTOGRAM_BIN_COUNT) );
			IncreaseArrayIndexCount( HistogramBinHits, Bin );
			//HistogramBinHits[Bin]++;
			GreenNear = GreenNear || ContainsGreen( Rgba.xyz);
		}
	}

	if ( !GreenNear )
	{
		return false;
	}

	//	get the sample and normalise it to the min/max range
	vec4 Rgba = texture2D( InputTexture, FragUv );
	float Luma = GetLuma( Rgba );
	
	Luma = Range( MinLuma, MaxLuma, Luma );
	gl_FragColor = vec4( Luma, Luma, Luma, 1.0 );
	
	/*
	//	show how many bins we hit in historgram
	int BinHitCount = 0;
	for ( int b=0;	b<HISTOGRAM_BIN_COUNT;	b++ )
		if ( HistogramBinHits[b] > 0 )
			BinHitCount++;
	gl_FragColor.xyz = NormalToRedGreen( float(BinHitCount)/float(HISTOGRAM_BIN_COUNT) ); 
	*/
	//	show low vs high range areas
	//gl_FragColor.xyz = NormalToRedGreen( MaxLuma-MinLuma ); 
	
	//gl_FragColor.xyz *= vec3(Luma,Luma,Luma);
	
	//Luma = Luma < 0.450 ? 0.0 : 1.0;
	//gl_FragColor.xyz = vec3(Luma,Luma,Luma);
	
	#define LOW_CONTRAST 0.12
	//	make low-range areas black
	if ( MaxLuma-MinLuma < LOW_CONTRAST )
		return false;
		/*
	#define HIGH_NOISE_BIN_COUNT	(16)
	if ( BinHitCount >= HIGH_NOISE_BIN_COUNT )
	{
		//gl_FragColor.xyz = vec3(1,0,0);
	}
	*/
	return Luma > 0.50;
}


void main()
{
	bool SelfBright = IsBright(0,0);
/*	
	//	dilate
	for ( int y=-DILATE_RADIUS;	y<=DILATE_RADIUS;	y++ )
	{
		for ( int x=-DILATE_RADIUS;	x<=DILATE_RADIUS;	x++ )
		{
			bool NeighbourBright = IsBright(x,y);
			SelfBright = SelfBright || NeighbourBright;
		}
	}
	*/
	gl_FragColor = SelfBright ? vec4(1,1,1,1) : vec4(0,0,0,1);
}

`;
export default Frag;
