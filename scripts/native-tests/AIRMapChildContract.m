// Host-side contract tests using the installed AIRMap methods and real Foundation arrays.
// UIKit, MapKit and React are stubs: this does not certify device/Fabric lifecycle behavior.
#import <Foundation/Foundation.h>

@protocol RCTComponent <NSObject>
- (NSArray *)reactSubviews;
@end
@protocol MKAnnotation @end
@protocol MKOverlay @end
@interface UIView : NSObject <RCTComponent>
@property(nonatomic, strong) NSArray *children;
@end
@implementation UIView
- (NSArray *)reactSubviews { return self.children ?: @[]; }
@end
@interface AIRMapMarker : UIView <MKAnnotation> @end
@implementation AIRMapMarker @end
@interface TestOverlay : UIView <MKOverlay>
@property(nonatomic, weak) id map;
@end
@implementation TestOverlay @end
#define OVERLAY_CLASS(name) @interface name : TestOverlay @end @implementation name @end
OVERLAY_CLASS(AIRMapPolyline)
OVERLAY_CLASS(AIRMapPolygon)
OVERLAY_CLASS(AIRMapCircle)
OVERLAY_CLASS(AIRMapUrlTile)
OVERLAY_CLASS(AIRMapWMSTile)
OVERLAY_CLASS(AIRMapLocalTile)
OVERLAY_CLASS(AIRMapOverlay)
@interface AIRMap : UIView {
    NSMutableArray *_reactSubviews;
}
@property(nonatomic, strong) NSMutableArray *annotations;
@property(nonatomic, strong) NSMutableArray *overlays;
- (void)insertReactSubview:(id<RCTComponent>)subview atIndex:(NSInteger)index;
- (void)removeReactSubview:(id<RCTComponent>)subview;
@end
@implementation AIRMap
- (instancetype)init {
    if ((self = [super init])) {
        _reactSubviews = [NSMutableArray new];
        self.annotations = [NSMutableArray new];
        self.overlays = [NSMutableArray new];
    }
    return self;
}
- (NSArray *)reactSubviews { return [_reactSubviews copy]; }
- (void)addAnnotation:(id)value { [self.annotations addObject:value]; }
- (void)removeAnnotation:(id)value { [self.annotations removeObject:value]; }
- (void)addOverlay:(id)value { [self.overlays addObject:value]; }
- (void)removeOverlay:(id)value { [self.overlays removeObject:value]; }
/* INSERT_METHOD */
/* REMOVE_METHOD */
@end

static NSUInteger checks = 0;
static void check(BOOL success, NSString *message) {
    checks++;
    if (!success) @throw [NSException exceptionWithName:@"ContractFailure" reason:message userInfo:nil];
}
int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc > 1 && strcmp(argv[1], "original") == 0) {
            @try { [[AIRMap new] insertReactSubview:nil atIndex:0]; }
            @catch (NSException *exception) {
                if ([exception.name isEqualToString:NSInvalidArgumentException] &&
                    [exception.reason containsString:@"nil"]) {
                    puts("PASS original source reproduces NSInvalidArgumentException for nil child");
                    return 0;
                }
                NSLog(@"Unexpected exception: %@", exception);
                return 1;
            }
            fputs("Original source did not reproduce the crash\n", stderr);
            return 1;
        }
        @try {
            AIRMap *map = [AIRMap new];
            for (NSNumber *index in @[@0, @1, @999, @(-1)]) {
                [map insertReactSubview:nil atIndex:index.integerValue];
                check(map.reactSubviews.count == 0, @"nil changed the child list");
                check(map.annotations.count == 0 && map.overlays.count == 0, @"nil changed map objects");
            }
            AIRMapMarker *a = [AIRMapMarker new], *b = [AIRMapMarker new], *c = [AIRMapMarker new];
            [map insertReactSubview:a atIndex:0];
            [map insertReactSubview:nil atIndex:1];
            [map insertReactSubview:b atIndex:99];
            [map insertReactSubview:c atIndex:1];
            check([map.reactSubviews isEqual:@[a, c, b]], @"valid insertion order changed");
            check(map.annotations.count == 3, @"markers missing");
            [map removeReactSubview:c];
            check([map.reactSubviews isEqual:@[a, b]] && map.annotations.count == 2, @"marker removal failed");
            for (Class kind in @[[AIRMapPolyline class], [AIRMapPolygon class], [AIRMapCircle class],
                                 [AIRMapUrlTile class], [AIRMapWMSTile class], [AIRMapLocalTile class], [AIRMapOverlay class]]) {
                TestOverlay *overlay = [kind new];
                [map insertReactSubview:overlay atIndex:999];
                check(overlay.map == map && [map.overlays containsObject:overlay], @"overlay attachment failed");
                [map removeReactSubview:overlay];
                check(![map.overlays containsObject:overlay] && ![map.reactSubviews containsObject:overlay], @"overlay removal failed");
            }
            UIView *wrapper = [UIView new];
            AIRMapPolyline *line = [AIRMapPolyline new];
            AIRMapMarker *nestedMarker = [AIRMapMarker new];
            wrapper.children = @[line, nestedMarker];
            [map insertReactSubview:wrapper atIndex:999];
            check([map.overlays containsObject:line] && [map.annotations containsObject:nestedMarker], @"nested children missing");
            [map removeReactSubview:wrapper];
            check(![map.overlays containsObject:line] && ![map.annotations containsObject:nestedMarker], @"nested children not removed");
            UIView *last = [UIView new];
            [map insertReactSubview:last atIndex:-1];
            check(map.reactSubviews.lastObject == last, @"unsigned index clamp failed");
            [map removeReactSubview:last];
            [map removeReactSubview:a];
            [map removeReactSubview:b];
            for (NSUInteger i = 0; i < 1000; i++) {
                [map insertReactSubview:nil atIndex:2];
                [map insertReactSubview:a atIndex:2];
                [map insertReactSubview:line atIndex:3];
                [map removeReactSubview:a];
                [map removeReactSubview:line];
                check(map.reactSubviews.count == 0 && map.annotations.count == 0 && map.overlays.count == 0,
                      @"repeated insert/remove left stale objects");
            }
            printf("PASS patched AIRMap native child contract: %lu assertions\n", (unsigned long)checks);
            return 0;
        } @catch (NSException *exception) {
            NSLog(@"FAIL %@", exception);
            return 1;
        }
    }
}
